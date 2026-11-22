import path from 'path'
import type { RepoStatus, StatusPayload, ToolVersion } from '../../shared/types'
import { cloneRepo, updateRepo } from '../actions'
import { mapLimit } from '../exec'
import { ConfigError, MARKER, expandTilde, findHome, loadHome, toolsOf } from '../home'
import { installTool } from '../install'
import { collectStatus } from '../status'
import { readToolVersions } from '../versions'
import { FILTERS, type FleetFilter, type ToolName } from './tools'

/** What each tool of `zeus mcp` answers; the catalogue is in tools.ts, the protocol in index.ts. */
export type McpContext = {
  /** The root the server was started in or beneath. Null when it was started outside any. */
  root: string | null
  cwd: string
  version: string
}

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** An answer that is a refusal: shown to the model as the tool's result, flagged as an error. */
class ToolError extends Error {}

type Params = Record<string, unknown>

export const paramsOf = (value: unknown): Params =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Params) : {}

const stringOf = (params: Params, key: string) => {
  const value = params[key]
  return typeof value === 'string' ? value : undefined
}

/** How long GitHub's answer is reused between two calls: a conversation asks several in a row. */
const GITHUB_GOOD_FOR_MS = 60 * 1000

const read = async (ctx: McpContext, params: Params, fresh = params.refresh === true) => {
  const asked = stringOf(params, 'root')
  const from = asked ? path.resolve(ctx.cwd, expandTilde(asked)) : ctx.cwd
  // Looked for again on every call, so a root made after the server started is found.
  const root = (asked ? null : ctx.root) ?? findHome(from)
  if (!root) {
    throw new ToolError(
      `No Zeus root at ${from} or above: no ${MARKER}/ folder. Run \`zeus init\` in the parent folder of the projects, or pass "root".`,
    )
  }
  return collectStatus(loadHome(root), ctx.version, {
    githubMaxAgeMs: fresh ? 0 : GITHUB_GOOD_FOR_MS,
    complete: params.complete === true,
  })
}

/** A repository by `owner/name`, or by its bare name when only one followed repository carries it. */
const find = (status: StatusPayload, wanted: string | undefined) => {
  if (!wanted) throw new ToolError('"repo" is required: "owner/name", or a bare name.')
  const key = wanted.toLowerCase()
  const matches = status.repos.filter(
    (repo) => repo.id.toLowerCase() === key || repo.remote.name.toLowerCase() === key,
  )
  if (matches.length === 1 && matches[0]) return matches[0]
  throw new ToolError(
    matches.length === 0
      ? `No followed repository is called ${wanted}. \`fleet\` lists them.`
      : `${wanted} is ambiguous: ${matches.map((repo) => repo.id).join(', ')}. Use "owner/name".`,
  )
}

/** The repositories of one workspace, by the login of its account. All of them without a name. */
const ofWorkspace = (status: StatusPayload, wanted: string | undefined) => {
  if (wanted === undefined) return status.repos
  const account = status.workspaces.find(
    (workspace) => workspace.login.toLowerCase() === wanted.toLowerCase(),
  )
  if (!account) {
    throw new ToolError(
      `No workspace is called ${wanted}. The workspaces are: ${status.workspaces.map((workspace) => workspace.login).join(', ') || 'none — gh may be signed out'}.`,
    )
  }
  if (account.hidden) throw new ToolError(`${account.login} is left out of this root's fleet.`)
  return status.repos.filter((repo) => repo.workspace === account.login)
}

/**
 * Why a clone should not be worked in as it is — the things a person would want to know before a
 * session is opened on it. Empty when it is ready.
 */
export const notReadyBecause = (repo: RepoStatus): string[] => {
  const local = repo.local
  if (!local) return ['not cloned on this machine']
  const reasons: string[] = []
  if (local.branch === null) reasons.push('HEAD is detached')
  if (repo.sync === 'behind') reasons.push('GitHub has commits this clone lacks: update it first')
  if (repo.sync === 'diverged') {
    reasons.push('the branch and its upstream have diverged: to settle by hand')
  }
  if (local.dirtyFiles > 0) {
    reasons.push(`${local.dirtyFiles} uncommitted file${local.dirtyFiles > 1 ? 's' : ''}`)
  }
  return reasons
}

const needsAttention = (repo: RepoStatus) =>
  repo.sync === 'behind' ||
  repo.sync === 'diverged' ||
  (repo.local?.dirtyFiles ?? 0) > 0 ||
  (repo.local?.ahead ?? 0) > 0 ||
  repo.remote.ci === 'failure'

const KEEP: Record<FleetFilter, (repo: RepoStatus) => boolean> = {
  all: () => true,
  attention: needsAttention,
  cloned: (repo) => repo.local !== null,
  'to-clone': (repo) => repo.local === null,
  behind: (repo) => repo.sync === 'behind' || repo.sync === 'diverged',
  dirty: (repo) => (repo.local?.dirtyFiles ?? 0) > 0,
  ahead: (repo) => (repo.local?.ahead ?? 0) > 0,
  'ci-failing': (repo) => repo.remote.ci === 'failure',
}

const count = (repos: RepoStatus[], keep: (repo: RepoStatus) => boolean) =>
  repos.filter(keep).length

/** One repository as a line of the fleet: enough to choose, with the path to act. */
const line = (repo: RepoStatus) => ({
  id: repo.id,
  workspace: repo.workspace,
  path: repo.local?.path ?? null,
  branch: repo.local?.branch ?? null,
  sync: repo.sync,
  behind: repo.local?.behind ?? null,
  ahead: repo.local?.ahead ?? null,
  uncommittedFiles: repo.local?.dirtyFiles ?? null,
  // Null while GitHub has not been asked: a repository of a large account that is not cloned.
  ci: repo.remote.detailed ? repo.remote.ci : null,
  openPullRequests: repo.remote.detailed ? repo.remote.openPullRequests : null,
  ready: notReadyBecause(repo).length === 0,
  // The score code-atlas recorded in the clone — its baseline — when it is set up there.
  ...(repo.atlas ? { codeAtlasScore: repo.atlas.score?.overall ?? null } : {}),
})

/**
 * The fleet as the `fleet` tool answers it. `repos` is the scope — the whole fleet, or one
 * workspace — which the counts are about; the filter and the search then narrow what is listed.
 */
export const fleetView = (
  status: StatusPayload,
  repos: RepoStatus[],
  { filter = 'all', search }: { filter?: FleetFilter; search?: string },
) => {
  const words = (search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const shown = repos.filter((repo) => {
    if (!KEEP[filter](repo)) return false
    const haystack = [
      repo.remote.name,
      repo.remote.description,
      repo.remote.language ?? '',
      repo.local?.relativePath ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  return {
    root: status.home.root,
    workspaces: status.workspaces
      .filter((workspace) => !workspace.hidden)
      .map((workspace) => workspace.login),
    counts: {
      followed: repos.length,
      cloned: count(repos, KEEP.cloned),
      toClone: count(repos, KEEP['to-clone']),
      behind: count(repos, KEEP.behind),
      withUncommittedFiles: count(repos, KEEP.dirty),
      withUnpushedCommits: count(repos, KEEP.ahead),
      ciFailing: count(repos, KEEP['ci-failing']),
      // Repositories whose CI and counts GitHub was not asked for: `ciFailing` says nothing of them.
      ciNotRead: count(repos, (repo) => !repo.remote.detailed && !repo.remote.isArchived),
    },
    shown: shown.length,
    repos: shown.map(line),
    ...(status.warnings.length > 0 ? { warnings: status.warnings } : {}),
  }
}

/** One repository as the `repo` tool answers it. */
export const repoView = (status: StatusPayload, repo: RepoStatus) => {
  const reasons = notReadyBecause(repo)
  return {
    id: repo.id,
    workspace: repo.workspace,
    sync: repo.sync,
    remoteHasNew: repo.remoteHasNew,
    ready: reasons.length === 0,
    ...(reasons.length > 0 ? { notReadyBecause: reasons } : {}),
    clone: repo.local && {
      path: repo.local.path,
      relativePath: repo.local.relativePath,
      branch: repo.local.branch,
      upstream: repo.local.upstream,
      ahead: repo.local.ahead,
      behind: repo.local.behind,
      uncommittedFiles: repo.local.dirtyFiles,
      modifiedTrackedFiles: repo.local.modifiedFiles,
      lastCommitAt: repo.local.lastCommitAt,
      hasClaudeMd: repo.local.hasClaudeMd,
      hasCi: repo.local.hasCi,
    },
    github: {
      url: repo.remote.url,
      description: repo.remote.description,
      language: repo.remote.language,
      private: repo.remote.isPrivate,
      archived: repo.remote.isArchived,
      defaultBranch: repo.remote.defaultBranch,
      lastCommitOnDefaultBranchAt: repo.remote.headCommittedAt,
      lastPushAt: repo.remote.pushedAt,
      ci: repo.remote.ci,
      openPullRequests: repo.remote.openPullRequests,
      openIssues: repo.remote.openIssues,
    },
    tools: status.tools.filter((tool) => tool.repos.includes(repo.id)).map((tool) => tool.id),
    // What code-atlas recorded here: a reference accepted at `recordedAt`, not a measure of now.
    codeAtlas: repo.atlas && {
      score: repo.atlas.score?.overall ?? null,
      recordedAt: repo.atlas.score?.savedAt ?? null,
      families: repo.atlas.score?.families ?? [],
    },
  }
}

/** The parent folder as the `home` tool answers it. */
export const homeView = (status: StatusPayload, versions: Record<string, ToolVersion> = {}) => ({
  root: status.home.root,
  signedInAs: status.home.login,
  cloneProtocol: status.home.cloneProtocol,
  workspaces: status.workspaces.map((workspace) => ({
    login: workspace.login,
    kind: workspace.kind,
    followed: !workspace.hidden,
    newClonesGoTo: path.join(status.home.root, workspace.folder),
    repositories: workspace.hidden
      ? null
      : status.repos.filter((repo) => repo.workspace === workspace.login).length,
    // What GitHub lists for it that this root does not follow, and so `fleet` never shows.
    repositoriesLeftOut: workspace.hidden
      ? null
      : workspace.followedRepos === null
        ? 0
        : workspace.repoNames.filter((name) => !workspace.followedRepos?.includes(name)).length,
    // Read-only on GitHub and not cloned here, so `fleet` leaves them out: named for the record.
    archived: workspace.hidden
      ? null
      : status.archived
          .filter((archived) => archived.workspace === workspace.login)
          .map((archived) => archived.name),
  })),
  archivedNotListed: status.archived.length,
  tools: status.tools.map((tool) => ({
    id: tool.id,
    scope: tool.scope,
    installed: tool.installed,
    version: versions[tool.id]?.installed ?? tool.version,
    // Machine tools and plugins only: a project's tool is kept current by that project.
    ...(versions[tool.id]
      ? { latestVersion: versions[tool.id]?.latest, upToDate: !versions[tool.id]?.outdated }
      : {}),
    inPlaceIn: tool.repos,
    ...(tool.run ? { run: tool.run } : {}),
    // What `install` would run, and — for a tool that lives in a project — where it could.
    ...(tool.installCommands.length > 0 ? { install: tool.installCommands } : {}),
    ...(tool.installable.length > 0 ? { installableIn: tool.installable } : {}),
  })),
  otherGitFolders: status.orphans.map(({ repo, reason }) => ({
    path: repo.path,
    reason,
    ...(repo.githubId ? { github: repo.githubId } : {}),
    uncommittedFiles: repo.dirtyFiles,
  })),
  ...(status.warnings.length > 0 ? { warnings: status.warnings } : {}),
})

/** How many clones `update` fetches at once. */
const PARALLEL = 4

const answer = async (ctx: McpContext, name: ToolName, params: Params): Promise<unknown> => {
  switch (name) {
    case 'fleet': {
      const status = await read(ctx, params)
      const filter = FILTERS.find((candidate) => candidate === params.filter)
      if (params.filter !== undefined && filter === undefined) {
        throw new ToolError(`"filter" must be one of: ${FILTERS.join(', ')}.`)
      }
      return fleetView(status, ofWorkspace(status, stringOf(params, 'workspace')), {
        filter,
        search: stringOf(params, 'search'),
      })
    }
    case 'repo': {
      const status = await read(ctx, params)
      return repoView(status, find(status, stringOf(params, 'repo')))
    }
    case 'home': {
      const status = await read(ctx, params)
      // npm and GitHub are only asked when the agent wants to know: offline, they take seconds.
      return homeView(
        status,
        params.versions === true ? await readToolVersions(status.tools) : undefined,
      )
    }
    case 'update': {
      const status = await read(ctx, params, false)
      const names = Array.isArray(params.repos)
        ? params.repos.filter((item): item is string => typeof item === 'string')
        : []
      const workspace = stringOf(params, 'workspace')
      const targets =
        params.all === true || workspace !== undefined
          ? ofWorkspace(status, workspace).filter((repo) => repo.local !== null)
          : names.map((wanted) => find(status, wanted))
      if (targets.length === 0) {
        throw new ToolError('Name the repositories in "repos", a "workspace", or pass "all": true.')
      }
      return { results: await mapLimit(targets, PARALLEL, updateRepo) }
    }
    case 'clone': {
      const status = await read(ctx, params, false)
      const repo = find(status, stringOf(params, 'repo'))
      return cloneRepo(status, repo, stringOf(params, 'folder') ?? null)
    }
    case 'install': {
      const status = await read(ctx, params, false)
      const tools = toolsOf(loadHome(status.home.root))
      const tool = tools.find((candidate) => candidate.id === stringOf(params, 'tool'))
      if (!tool) {
        throw new ToolError(
          `No tool is called ${stringOf(params, 'tool') ?? ''}. The tools are: ${tools.map((candidate) => candidate.id).join(', ')}.`,
        )
      }
      const wanted = stringOf(params, 'repo')
      const repo = wanted === undefined ? null : find(status, wanted)
      return installTool(tool, {
        root: status.home.root,
        repoId: repo?.id ?? null,
        clone: repo?.local ?? null,
      })
    }
  }
}

/** Runs one tool. A refusal, or a config the user must fix, comes back as the tool's own answer. */
export const callTool = async (
  ctx: McpContext,
  name: ToolName,
  params: Params,
): Promise<ToolResult> => {
  try {
    const value = await answer(ctx, name, params)
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 1) }] }
  } catch (error) {
    if (!(error instanceof ToolError) && !(error instanceof ConfigError)) throw error
    return { content: [{ type: 'text', text: error.message }], isError: true }
  }
}
