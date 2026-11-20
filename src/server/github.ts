import type { CiState, RemoteRepo, RepoDetail } from '../shared/types'
import { exec, mapLimit, reasonOf } from './exec'
import { asArray, asNumber, asString, at, parseJson } from './json'

/**
 * GitHub is asked in two passes, because what is cheap to list and what is dear to compute are not
 * the same thing. The first pass lists an account's repositories with what GitHub holds ready —
 * names, flags, language — a hundred at a time, in a second. Even the name of the default branch
 * is kept out of it: it alone triples that. `repositoryOwner` answers for a user and for an
 * organization alike.
 */
const LIST = `
query($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, orderBy: {field: NAME, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name nameWithOwner description url sshUrl isPrivate isArchived isFork pushedAt
        primaryLanguage { name }
      }
    }
  }
}`

/**
 * The second pass asks, for a handful of repositories at once, what GitHub has to work out: the
 * tip of the default branch, its CI roll-up, the open pull request and issue counts. Asked for a
 * hundred repositories in one go, an organization of two hundred times out; and even by the
 * handful it takes ten seconds for that many — which is why only what is needed is asked first.
 */
const detailsQuery = (ids: string[]) => `
query {
  nodes(ids: ${JSON.stringify(ids)}) {
    ... on Repository {
      id
      defaultBranchRef { name target { ... on Commit { oid committedDate statusCheckRollup { state } } } }
      pullRequests(states: OPEN) { totalCount }
      issues(states: OPEN) { totalCount }
    }
  }
}`

/** How many repositories one detail request asks about, and how many requests run at once. */
const DETAILS_CHUNK = 25
const DETAILS_PARALLEL = 8

/** A node id is opaque, but made of these characters only — checked before one goes in a query. */
const NODE_ID = /^[A-Za-z0-9_=+/-]+$/

const ciOf = (state: string | null): CiState => {
  if (state === 'SUCCESS') return 'success'
  if (state === 'FAILURE' || state === 'ERROR') return 'failure'
  if (state === 'PENDING' || state === 'EXPECTED') return 'pending'
  return 'none'
}

/** What a repository is given until its detail arrives: nothing known, nothing claimed. */
const BLANK: RepoDetail = {
  defaultBranch: null,
  headOid: null,
  headCommittedAt: null,
  ci: 'none',
  openPullRequests: 0,
  openIssues: 0,
}

export const toDetail = (node: unknown): RepoDetail => ({
  defaultBranch: asString(at(node, 'defaultBranchRef', 'name')),
  headOid: asString(at(node, 'defaultBranchRef', 'target', 'oid')),
  headCommittedAt: asString(at(node, 'defaultBranchRef', 'target', 'committedDate')),
  ci: ciOf(asString(at(node, 'defaultBranchRef', 'target', 'statusCheckRollup', 'state'))),
  openPullRequests: asNumber(at(node, 'pullRequests', 'totalCount')) ?? 0,
  openIssues: asNumber(at(node, 'issues', 'totalCount')) ?? 0,
})

/** A repository as the listing gives it, with its node id — the handle its detail is asked by. */
export type ListedRepo = { nodeId: string | null; repo: RemoteRepo }

export const toListedRepo = (node: unknown): ListedRepo | null => {
  const fullName = asString(at(node, 'nameWithOwner'))
  const name = asString(at(node, 'name'))
  if (!fullName || !name) return null
  const id = asString(at(node, 'id'))
  return {
    nodeId: id && NODE_ID.test(id) ? id : null,
    repo: {
      fullName,
      owner: fullName.slice(0, fullName.indexOf('/')),
      name,
      description: asString(at(node, 'description')) ?? '',
      url: asString(at(node, 'url')) ?? `https://github.com/${fullName}`,
      sshUrl: asString(at(node, 'sshUrl')) ?? `git@github.com:${fullName}.git`,
      isPrivate: at(node, 'isPrivate') === true,
      isArchived: at(node, 'isArchived') === true,
      isFork: at(node, 'isFork') === true,
      language: asString(at(node, 'primaryLanguage', 'name')),
      pushedAt: asString(at(node, 'pushedAt')),
      ...BLANK,
      detailed: false,
    },
  }
}

export type OwnerListing = { owner: string; listed: ListedRepo[]; error: string | null }

/** How many pages to follow before giving up: a guard against a cursor that never ends. */
const MAX_PAGES = 50

const graphql = (query: string, variables: Record<string, string> = {}) =>
  exec(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      ...Object.entries(variables).flatMap(([key, value]) => ['-f', `${key}=${value}`]),
    ],
    { timeoutMs: 30_000 },
  )

/**
 * The repositories an account holds, read with the `gh` the user is signed in to: Zeus keeps no
 * token, and sees exactly what that login may see.
 */
const readListing = async (owner: string): Promise<OwnerListing> => {
  const listed: ListedRepo[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await graphql(LIST, cursor ? { owner, cursor } : { owner })
    if (!result.ok) {
      const missing = result.code === null && !result.timedOut
      return {
        owner,
        listed,
        error: missing
          ? 'la commande gh est introuvable — installe GitHub CLI puis « gh auth login »'
          : reasonOf(result),
      }
    }
    const connection = at(parseJson(result.stdout), 'data', 'repositoryOwner', 'repositories')
    if (connection === undefined) return { owner, listed, error: `compte inconnu : ${owner}` }
    for (const node of asArray(at(connection, 'nodes'))) {
      const repo = toListedRepo(node)
      if (repo) listed.push(repo)
    }
    if (at(connection, 'pageInfo', 'hasNextPage') !== true) break
    cursor = asString(at(connection, 'pageInfo', 'endCursor'))
    if (!cursor) break
  }
  return { owner, listed, error: null }
}

const listings = new Map<string, { at: number; result: OwnerListing }>()

/**
 * The listing of an account, kept for `maxAgeMs`. GitHub's side barely moves between two clicks,
 * whereas the local side changes with every update: the page re-reads the clones at once and
 * reuses what GitHub said a moment ago. A read that brought nothing back is never kept.
 */
export const listOwnerRepos = async (owner: string, maxAgeMs = 0): Promise<OwnerListing> => {
  const kept = listings.get(owner)
  if (kept && Date.now() - kept.at < maxAgeMs) return kept.result
  const result = await readListing(owner)
  if (result.listed.length > 0) listings.set(owner, { at: Date.now(), result })
  return result
}

const details = new Map<string, { at: number; detail: RepoDetail }>()

/** The detail of a repository when it was read within `maxAgeMs`, by node id. */
export const knownDetail = (nodeId: string | null, maxAgeMs: number): RepoDetail | null => {
  const kept = nodeId === null ? undefined : details.get(nodeId)
  return kept && Date.now() - kept.at < maxAgeMs ? kept.detail : null
}

/**
 * Reads the detail of some repositories, by node id, and keeps it. Returns how many could not be
 * had: a handful GitHub fails on leaves its own repositories blank, and the rest still arrive.
 */
export const fetchDetails = async (nodeIds: string[]): Promise<number> => {
  const chunks: string[][] = []
  for (let index = 0; index < nodeIds.length; index += DETAILS_CHUNK) {
    chunks.push(nodeIds.slice(index, index + DETAILS_CHUNK))
  }
  let failed = 0
  await mapLimit(chunks, DETAILS_PARALLEL, async (chunk) => {
    const result = await graphql(detailsQuery(chunk))
    if (!result.ok) {
      failed += chunk.length
      return
    }
    for (const node of asArray(at(parseJson(result.stdout), 'data', 'nodes'))) {
      const id = asString(at(node, 'id'))
      if (id) details.set(id, { at: Date.now(), detail: toDetail(node) })
    }
  })
  return failed
}
