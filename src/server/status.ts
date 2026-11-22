import fs from 'fs'
import path from 'path'
import type {
  ArchivedRepo,
  DetailsPayload,
  LocalRepo,
  Orphan,
  RemoteRepo,
  RepoStatus,
  StatusPayload,
  SyncState,
  Workspace,
} from '../shared/types'
import { mapLimit } from './exec'
import { fetchDetails, knownDetail, listOwnerRepos, type ListedRepo } from './github'
import { folderFor, followsRepo, tilde, toolsOf, type Home } from './home'
import { asArray, asRecord, parseJson } from './json'
import { findRepos, hasCommit, readLocalRepo } from './local'
import { cloneProtocol, listOwners } from './machine'
import { connectCommand, statusCommandFor } from './selfCommand'
import { canOpenTerminal } from './terminal'
import { readTools } from './tools'

/**
 * How a clone compares with GitHub. `remoteHasNew` comes first: the counts are against the upstream
 * as of the last fetch, so a clone nobody fetched for a month still says "0 behind".
 */
export const syncOf = (local: LocalRepo | null, remoteHasNew: boolean): SyncState => {
  if (!local) return 'not-cloned'
  if (remoteHasNew) return 'behind'
  if (local.ahead === null || local.behind === null) return 'no-upstream'
  if (local.ahead > 0 && local.behind > 0) return 'diverged'
  if (local.behind > 0) return 'behind'
  if (local.ahead > 0) return 'ahead'
  return 'up-to-date'
}

/** The folder a clone sits in under the root: `AtelierPerso/Agenda` is in `AtelierPerso`. */
const folderOf = (relativePath: string) => {
  const cut = relativePath.lastIndexOf('/')
  return cut === -1 ? null : relativePath.slice(0, cut)
}

/** A real checkout before a worktree or a submodule, then the shortest path. */
const preferred = (a: LocalRepo, b: LocalRepo) =>
  a.relativePath.length - b.relativePath.length || a.relativePath.localeCompare(b.relativePath)

/**
 * Whether a `.mcp.json` declares a Zeus server: some command whose last word is `mcp` and that
 * names zeus somewhere — `npx @vincweb/zeus mcp`, `node Zeus/dist/cli.js mcp`.
 */
export const declaresZeus = (mcpJson: unknown) =>
  Object.values(asRecord(asRecord(mcpJson)?.mcpServers) ?? {}).some((server) => {
    const entry = asRecord(server)
    const words = [entry?.command, ...asArray(entry?.args)].filter(
      (word): word is string => typeof word === 'string',
    )
    return words[words.length - 1] === 'mcp' && words.some((word) => /zeus/i.test(word))
  })

const isConnected = (root: string) => {
  try {
    return declaresZeus(parseJson(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')))
  } catch {
    return false
  }
}

const ownerOf = (githubId: string) => githubId.slice(0, githubId.indexOf('/'))

/**
 * Sorts the git folders found under a root: the clone of each followed repository, and the rest
 * with the reason it is not one. A clone is matched by its origin remote, never by its folder
 * name — `Autres/Essais` is whatever its remote says it is.
 *
 * `followed` and `readable` are lowercased logins: the accounts in the fleet, and those among
 * them GitHub answered for. A clone of an account that could not be read is left out of both
 * lists: nothing true can be said of it until GitHub answers. `leftOut` are the lowercased ids of
 * repositories GitHub lists for a followed account that the root does not follow.
 */
export const sortClones = (
  locals: LocalRepo[],
  remotes: ReadonlyMap<string, RemoteRepo>,
  followed: ReadonlySet<string>,
  readable: ReadonlySet<string>,
  leftOut: ReadonlySet<string> = new Set(),
) => {
  const clones = new Map<string, LocalRepo>()
  const orphans: Orphan[] = []
  for (const local of [...locals].sort(preferred)) {
    if (!local.remoteUrl) orphans.push({ repo: local, reason: 'no-remote' })
    else if (!local.githubId) orphans.push({ repo: local, reason: 'not-github' })
    else if (!followed.has(ownerOf(local.githubId))) {
      orphans.push({ repo: local, reason: 'other-account' })
    } else if (!readable.has(ownerOf(local.githubId))) continue
    else if (leftOut.has(local.githubId)) orphans.push({ repo: local, reason: 'not-followed' })
    else if (!remotes.has(local.githubId)) orphans.push({ repo: local, reason: 'unknown-repo' })
    else if (clones.has(local.githubId)) orphans.push({ repo: local, reason: 'duplicate' })
    else clones.set(local.githubId, local)
  }
  orphans.sort((a, b) => a.repo.relativePath.localeCompare(b.repo.relativePath))
  return { clones, orphans }
}

/** How the page names an account: your own is « Perso », an organization keeps its name. */
const toWorkspace = (home: Home, login: string, kind: 'user' | 'org'): Workspace => ({
  login,
  kind,
  label: kind === 'user' ? 'Perso' : login,
  folder: folderFor(home, login),
  hidden: home.config.hiddenOwners.includes(login.toLowerCase()),
  repoNames: [],
  followedRepos: null,
})

const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' })

/**
 * What a listing offers to follow of an account — what the table could show: an archived
 * repository only when the root shows them or it has a clone — and what the root follows of it.
 * `cloned` are the lowercased ids of the clones found under the root.
 */
const withRepos = (
  home: Home,
  workspace: Workspace,
  listed: ListedRepo[],
  cloned: ReadonlySet<string>,
): Workspace => {
  const only = home.config.followedRepos[workspace.login.toLowerCase()]
  return {
    ...workspace,
    repoNames: listed
      .filter(
        ({ repo }) =>
          home.config.includeArchived ||
          !repo.isArchived ||
          cloned.has(repo.fullName.toLowerCase()),
      )
      .map(({ repo }) => repo.name)
      .sort(byName),
    // A name GitHub no longer lists is not followed: it goes at the next save.
    followedRepos:
      only === undefined
        ? null
        : listed
            .filter(({ repo }) => followsRepo(home, repo.owner, repo.name))
            .map(({ repo }) => repo.name)
            .sort(byName),
  }
}

/** Who you are on GitHub does not change between two clicks: kept this long between two reads. */
const OWNERS_GOOD_FOR_MS = 5 * 60 * 1000

/** How long a repository's detail — CI, counts, tip of the default branch — is reused. */
const DETAILS_GOOD_FOR_MS = 5 * 60 * 1000

/**
 * Up to this many repositories, an account is detailed whole and at once. Beyond, only its clones
 * are — what "behind" needs — and the rest is left for a second request, so a large organization
 * does not hold the page for ten seconds.
 */
const DETAILED_AT_ONCE = 60

type Listed = {
  home: Home
  /** The accounts, without what can be followed of them: that depends on the clones too. */
  workspaces: Workspace[]
  /** Everything GitHub lists for each followed account, by login. */
  listings: ReadonlyMap<string, ListedRepo[]>
  /** The repositories the root follows — and only those: nothing is asked about the others. */
  listed: ListedRepo[]
  /** Lowercased ids of what GitHub lists for a followed account that the root does not follow. */
  leftOut: Set<string>
  readable: Set<string>
  warnings: string[]
}

/** The accounts `gh` can see and what GitHub lists for those a root follows. No detail yet. */
const listFleet = async (home: Home, githubMaxAgeMs: number): Promise<Listed> => {
  const owners = await listOwners(githubMaxAgeMs > 0 ? OWNERS_GOOD_FOR_MS : 0)
  const warnings = owners.error ? [`GitHub n'a pas répondu : ${owners.error}`] : []
  const workspaces = owners.owners.map(({ login, kind }) => toWorkspace(home, login, kind))
  const answers = new Map(
    await Promise.all(
      workspaces
        .filter((workspace) => !workspace.hidden)
        .map(
          async (workspace) =>
            [workspace.login, await listOwnerRepos(workspace.login, githubMaxAgeMs)] as const,
        ),
    ),
  )
  const readable = new Set<string>()
  const listed: ListedRepo[] = []
  const leftOut = new Set<string>()
  const listings = new Map<string, ListedRepo[]>()
  for (const [login, { owner, listed: ofOwner, error }] of answers) {
    listings.set(login, ofOwner)
    if (error) warnings.push(`GitHub, pour ${owner} : ${error}`)
    // A listing that came back, even cut short, is enough to sort the clones on.
    if (ofOwner.length > 0 || !error) readable.add(owner.toLowerCase())
    for (const entry of ofOwner) {
      if (followsRepo(home, entry.repo.owner, entry.repo.name)) listed.push(entry)
      else leftOut.add(entry.repo.fullName.toLowerCase())
    }
  }
  return { home, workspaces, listings, listed, leftOut, readable, warnings }
}

/** A repository with its detail filled in when it is known, blank and marked so when it is not. */
const withDetail = ({ nodeId, repo }: ListedRepo): RemoteRepo => {
  const detail = knownDetail(nodeId, DETAILS_GOOD_FOR_MS)
  return detail ? { ...repo, ...detail, detailed: true } : repo
}

/**
 * The whole picture of a root: the accounts `gh` can see — each one a workspace —, what GitHub
 * lists for them, what git says of the clones under the root, and how the two line up. Nothing of
 * it is configured: who you are, what you own and what is cloned are all read where they live.
 *
 * `complete` waits for the detail of every repository; without it, a large account is detailed
 * only where it is cloned, and `collectDetails` brings the rest.
 */
export const collectStatus = async (
  home: Home,
  version = '',
  { githubMaxAgeMs = 0, complete = false }: { githubMaxAgeMs?: number; complete?: boolean } = {},
): Promise<StatusPayload> => {
  const [fleet, locals, protocol] = await Promise.all([
    listFleet(home, githubMaxAgeMs),
    mapLimit(findRepos(home.root, home.config.scanDepth), 8, (dir) =>
      readLocalRepo(home.root, dir),
    ),
    cloneProtocol(),
  ])
  const { listings, listed, leftOut, warnings, readable } = fleet
  const cloned = new Set(locals.flatMap((local) => local.githubId ?? []))
  const workspaces = fleet.workspaces.map((workspace) => {
    const listing = listings.get(workspace.login)
    return listing ? withRepos(home, workspace, listing, cloned) : workspace
  })
  const followed = workspaces.filter((workspace) => !workspace.hidden)

  const remotes = new Map<string, RemoteRepo>()
  for (const { repo } of listed) remotes.set(repo.fullName.toLowerCase(), repo)
  const { clones, orphans } = sortClones(
    locals,
    remotes,
    new Set(followed.map((workspace) => workspace.login.toLowerCase())),
    readable,
    leftOut,
  )

  // An archived repository still shows when it has a clone: that folder is yours to tidy. The
  // others are only listed, at the end of the page, with what the listing already says of them.
  const isShown = ({ repo }: ListedRepo) =>
    home.config.includeArchived || !repo.isArchived || clones.has(repo.fullName.toLowerCase())
  const shown = listed.filter(isShown)
  const archived = listed
    .filter((entry) => !isShown(entry))
    .map(({ repo }): ArchivedRepo => ({
      id: repo.fullName,
      workspace: repo.owner,
      name: repo.name,
      description: repo.description,
      url: repo.url,
      language: repo.language,
      isPrivate: repo.isPrivate,
      pushedAt: repo.pushedAt,
    }))
    .sort((a, b) => byName(a.name, b.name))

  // What is asked of GitHub now: every repository of a small account, the clones of a large one.
  const size = new Map<string, number>()
  for (const { repo } of shown) size.set(repo.owner, (size.get(repo.owner) ?? 0) + 1)
  const wanted = shown.filter(
    ({ nodeId, repo }) =>
      nodeId !== null &&
      (complete ||
        (size.get(repo.owner) ?? 0) <= DETAILED_AT_ONCE ||
        clones.has(repo.fullName.toLowerCase())) &&
      // A fresh read asks again; otherwise what was read a moment ago will do.
      (githubMaxAgeMs === 0 || knownDetail(nodeId, DETAILS_GOOD_FOR_MS) === null),
  )
  const failed = await fetchDetails(wanted.flatMap(({ nodeId }) => nodeId ?? []))
  if (failed > 0) {
    warnings.push(`GitHub : détails illisibles pour ${failed} repos (CI, PR, dernier commit)`)
  }

  const repos = await mapLimit(shown, 8, async (entry): Promise<RepoStatus> => {
    const remote = withDetail(entry)
    const local = clones.get(remote.fullName.toLowerCase()) ?? null
    const remoteHasNew =
      local !== null && remote.headOid !== null && !(await hasCommit(local.path, remote.headOid))
    return {
      id: remote.fullName,
      remote,
      local,
      sync: syncOf(local, remoteHasNew),
      remoteHasNew,
      workspace: remote.owner,
      group: local ? folderOf(local.relativePath) : null,
    }
  })
  repos.sort((a, b) => byName(a.remote.name, b.remote.name))

  // Where a new clone may go besides its account's folder: the root, and every folder that
  // already holds one.
  const folders = new Set([''])
  for (const local of locals) {
    const folder = folderOf(local.relativePath)
    if (folder !== null) folders.add(folder)
  }

  return {
    generatedAt: new Date().toISOString(),
    home: {
      root: home.root,
      label: tilde(home.root),
      name: path.basename(home.root),
      login: workspaces.find((workspace) => workspace.kind === 'user')?.login ?? null,
      folders: [...folders].sort(),
      cloneProtocol: protocol,
      statusCommand: statusCommandFor(home.root),
      claude: { connected: isConnected(home.root), connectCommand: connectCommand() },
      terminal: canOpenTerminal(),
      version,
    },
    workspaces,
    repos,
    orphans,
    tools: readTools(toolsOf(home), repos),
    archived,
    pendingDetails: repos.filter((repo) => !repo.remote.detailed && !repo.remote.isArchived).length,
    warnings,
  }
}

/** The listing may be a few minutes old here: it was read for the status this follows. */
const LISTING_GOOD_FOR_MS = 5 * 60 * 1000

/**
 * The detail a status left for later: every followed repository that is neither archived nor
 * detailed yet. Slow on a large organization — which is why it is its own request, answered while
 * the page is already on screen.
 */
export const collectDetails = async (home: Home): Promise<DetailsPayload> => {
  const { listed } = await listFleet(home, LISTING_GOOD_FOR_MS)
  const pending = listed.filter(
    ({ nodeId, repo }) =>
      nodeId !== null && !repo.isArchived && knownDetail(nodeId, DETAILS_GOOD_FOR_MS) === null,
  )
  const failed = await fetchDetails(pending.flatMap(({ nodeId }) => nodeId ?? []))
  const details: DetailsPayload['details'] = {}
  for (const { nodeId, repo } of pending) {
    const detail = knownDetail(nodeId, DETAILS_GOOD_FOR_MS)
    if (detail) details[repo.fullName] = detail
  }
  return { details, failed }
}
