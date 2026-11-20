import type { RepoDetail, RepoStatus } from '../shared/types'

/** What the tiles above the table narrow it to. */
export type Filter = 'all' | 'to-clone' | 'behind' | 'dirty' | 'ahead' | 'ci'

const isBehind = (repo: RepoStatus) => repo.sync === 'behind' || repo.sync === 'diverged'
const isDirty = (repo: RepoStatus) => (repo.local?.dirtyFiles ?? 0) > 0
const isAhead = (repo: RepoStatus) => (repo.local?.ahead ?? 0) > 0

const TESTS: Record<Filter, (repo: RepoStatus) => boolean> = {
  all: () => true,
  'to-clone': (repo) => repo.local === null,
  behind: isBehind,
  dirty: isDirty,
  ahead: isAhead,
  ci: (repo) => repo.remote.ci === 'failure',
}

export const countsOf = (repos: RepoStatus[]) => ({
  all: repos.length,
  cloned: repos.filter((repo) => repo.local !== null).length,
  'to-clone': repos.filter(TESTS['to-clone']).length,
  behind: repos.filter(isBehind).length,
  dirty: repos.filter(isDirty).length,
  ahead: repos.filter(isAhead).length,
  ci: repos.filter(TESTS.ci).length,
})

export type Counts = ReturnType<typeof countsOf>

/** The repositories of one account — or all of them, for no account. */
export const ofWorkspace = (repos: RepoStatus[], workspace: string | null) =>
  workspace === null ? repos : repos.filter((repo) => repo.workspace === workspace)

/**
 * Fills in the detail that arrived after the status: a large account is listed at once, and its
 * CI states and counts follow in a second answer.
 */
export const withDetails = (
  repos: RepoStatus[],
  details: Record<string, RepoDetail> | undefined,
) =>
  details === undefined
    ? repos
    : repos.map((repo) => {
        const detail = details[repo.id]
        return detail && !repo.remote.detailed
          ? { ...repo, remote: { ...repo.remote, ...detail, detailed: true } }
          : repo
      })

/** A search matches the name, the description, the language or the folder — any of its words. */
export const select = (repos: RepoStatus[], filter: Filter, search: string) => {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  return repos.filter((repo) => {
    if (!TESTS[filter](repo)) return false
    const haystack = [
      repo.remote.name,
      repo.remote.description,
      repo.remote.language ?? '',
      repo.local?.relativePath ?? '',
      repo.workspace,
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

export const ROOT_GROUP = 'À la racine'
export const UNCLONED_GROUP = 'Pas encore clonés'

export const groupOf = (repo: RepoStatus) =>
  repo.local === null ? UNCLONED_GROUP : (repo.group ?? ROOT_GROUP)

/** Repositories under the folder their clone lives in; what is not cloned yet comes last. */
export const groupRepos = (repos: RepoStatus[]) => {
  const groups = new Map<string, RepoStatus[]>()
  for (const repo of repos) {
    const name = groupOf(repo)
    groups.set(name, [...(groups.get(name) ?? []), repo])
  }
  return [...groups.entries()]
    .map(([name, members]) => ({ name, repos: members }))
    .sort((a, b) => {
      const rank = (name: string) => (name === UNCLONED_GROUP ? 1 : 0)
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'fr')
    })
}
