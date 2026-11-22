import type {
  ActionResult,
  DetailsPayload,
  InstallResult,
  HomeCandidate,
  JournalEntry,
  JournalLines,
  JournalPayload,
  HomesPayload,
  MachineCheck,
  OwnersPayload,
  SetupTarget,
  StatusPayload,
  ToolVersionsPayload,
} from '../shared/types'

/** What the server says went wrong, when it is the one answering. */
const errorIn = (payload: unknown) =>
  typeof payload === 'object' && payload !== null && 'error' in payload
    ? String(payload.error)
    : null

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorIn(payload) ?? `la requête a échoué (${response.status})`)
  return payload as T
}

/** Declared as JSON on purpose: it is what the server takes as proof the page itself is asking. */
const post = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const query = (params: [string, string][]) =>
  params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')

/** The roots found on this machine, plus what has become of the ones this browser remembers. */
export const fetchHomes = (remembered: string[]) =>
  request<HomesPayload>(
    `/api/homes?${query(remembered.map((root): [string, string] => ['also', root]))}`,
  )

/** The root a typed path belongs to. Rejects with the reason when it belongs to none. */
export const checkHome = (dir: string) =>
  request<HomeCandidate>(`/api/home?${query([['dir', dir]])}`)

/**
 * `fresh` asks GitHub again, which takes a few seconds; without it the server re-reads the clones
 * and reuses what GitHub said in the last minute — what the page wants right after an action.
 */
export const fetchStatus = (root: string, fresh: boolean) =>
  request<StatusPayload>(
    `/api/status?${query([
      ['root', root],
      ['fresh', fresh ? '1' : '0'],
    ])}`,
  )

/** What the status left for later: the CI and counts of a large account's repositories. */
export const fetchDetails = (root: string) =>
  request<DetailsPayload>(`/api/details?${query([['root', root]])}`)

/** `folder` null lets the server choose: the folder of the account that owns the repository. */
export const cloneRepo = (root: string, id: string, folder: string | null) =>
  post<ActionResult>('/api/clone', folder === null ? { root, id } : { root, id, folder })

export const updateRepo = (root: string, id: string) =>
  post<ActionResult>('/api/update', { root, id })

/** Which accounts a root leaves out; every other one `gh` can see is followed. */
export const saveAccounts = (root: string, hidden: string[]) =>
  post<{ hidden: string[] }>('/api/accounts', { root, hidden })

/** The repositories of an account to follow; the server turns « all of them » into « every one ». */
export const saveFollowedRepos = (root: string, login: string, repos: string[]) =>
  post<{ login: string; repos: string[] | null }>('/api/accounts/repos', { root, login, repos })

/** What this machine has of what Zeus needs: git, gh, an account, a way to clone. */
export const fetchMachine = () => request<MachineCheck>('/api/machine')

/** The account gh is signed in as, and its organizations. */
export const fetchOwners = () => request<OwnersPayload>('/api/owners')

/** What stands at a folder that could become a root. */
export const fetchTarget = (dir: string) =>
  request<SetupTarget>(`/api/setup/target?${query([['dir', dir]])}`)

export const createHome = (input: { dir: string; hidden: string[] }) =>
  post<{ root: string }>('/api/setup/create', input)

/** Opens the Claude desktop app on the root, with the prompt filled in and not sent. */
export const openInClaude = (root: string, prompt: string) =>
  post<{ opened: true }>('/api/claude/open', { root, prompt })

/**
 * Installs a tool: on the machine, in Claude Code, or — `repo` — in one clone. Only names travel:
 * what is run is the recipe the server holds for that tool.
 */
export const installTool = (root: string, tool: string, repo: string | null, update = false) =>
  post<InstallResult>('/api/tools/install', {
    root,
    tool,
    ...(repo === null ? {} : { repo }),
    ...(update ? { update } : {}),
  })

/**
 * Starts a tool: in Zeus, whose console then shows what it prints — the journal entry comes back —
 * or in Terminal, on macOS. In a clone for a project's tool.
 */
export const runTool = (
  root: string,
  tool: string,
  repo: string | null,
  where: 'zeus' | 'terminal',
) =>
  post<JournalEntry | { opened: boolean; command: string }>('/api/tools/run', {
    root,
    tool,
    where,
    ...(repo === null ? {} : { repo }),
  })

/** What the server did: its own lines, the actions, the tools started from the page. */
export const fetchJournal = () => request<JournalPayload>('/api/journal')

/** The lines of one entry of the journal, from line `from` on. */
export const fetchJournalLines = (id: number, from: number) =>
  request<JournalLines>(
    `/api/journal/lines?${query([
      ['id', String(id)],
      ['from', String(from)],
    ])}`,
  )

/** Stops a tool started from the page, by its entry in the journal. */
export const stopRun = (id: number) => post<{ stopping: boolean }>('/api/journal/stop', { id })

/** How the installed tools compare with their latest release. Slow: npm and GitHub are asked. */
export const fetchToolVersions = (root: string) =>
  request<ToolVersionsPayload>(`/api/tools/versions?${query([['root', root]])}`)
