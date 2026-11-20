/**
 * The URLs the page uses, shared so the server can print one and the client can read it back.
 *
 * Which root is shown lives in the URL rather than in the server, so a link to a fleet can be
 * reloaded and bookmarked, and two tabs can hold two roots at once.
 */

/** The welcome page: the roots found on this machine, and a field to name another. */
export const WELCOME_PATH = '/'

/** One root: its repositories, tools and stray folders. `?root=`, and `&workspace=` for one account. */
export const FLEET_PATH = '/fleet'

/** Setting a root up: checking the machine, choosing the parent folder, the accounts to follow. */
export const SETUP_PATH = '/setup'

/**
 * Slashes are left alone — they are legal in a query, and a path is easier to read than its
 * escapes, in the address bar as much as in the terminal.
 */
const folder = (dir: string) => encodeURIComponent(dir).replace(/%2F/g, '/')

export const fleetPath = (root: string, workspace: string | null = null) =>
  `${FLEET_PATH}?root=${folder(root)}${workspace ? `&workspace=${encodeURIComponent(workspace)}` : ''}`

export const setupPath = (dir = '') =>
  dir === '' ? SETUP_PATH : `${SETUP_PATH}?dir=${folder(dir)}`

const CLAUDE_PROMPT_LIMIT = 14000

/**
 * Opens a new session in the Code tab of the Claude desktop app, on a folder, with a prompt filled
 * in — and never sent: the person reads it, edits it, and sends it themselves.
 */
export const claudeLink = (prompt: string, dir: string) =>
  `claude://code/new?q=${encodeURIComponent(prompt.slice(0, CLAUDE_PROMPT_LIMIT))}&folder=${encodeURIComponent(dir)}`
