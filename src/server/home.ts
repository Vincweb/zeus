import fs from 'fs'
import os from 'os'
import path from 'path'
import { CODE_ATLAS } from '../shared/routes'
import type { HomeCandidate, ToolConfig, ToolScope } from '../shared/types'
import { ConfigError } from './errors'
import { isDirectory } from './folders'
import { toRecipe } from './install'
import { asArray, asNumber, asRecord, asString, parseJson } from './json'

/** The folder that marks a root. It may hold nothing at all: being there is the whole point. */
export const MARKER = '.zeus'
export const CONFIG_FILE = 'config.json'

/**
 * What a root may say about itself — all of it optional. The fleet needs none: accounts come from
 * `gh`, repositories from GitHub, clones from a scan. This is only for what nobody else can know.
 */
export type HomeConfig = {
  /** Accounts `gh` can see that this root leaves out. */
  hiddenOwners: string[]
  /**
   * The repositories followed of an account, by lowercased login and name, when not all of them
   * are. An account not named here is followed whole, those to come included.
   */
  followedRepos: Record<string, string[]>
  /** The folder new clones of an account go to, when it is not the account's own name. */
  folders: Record<string, string>
  scanDepth: number
  includeArchived: boolean
  /** Tools on top of the default ones; one with a default's id replaces it. */
  tools: ToolConfig[]
}

/**
 * A home is the parent folder Zeus works in: `.zeus/` at its root, clones beneath. Its path is
 * never written anywhere — it is found by walking up from wherever Zeus is started, the way git
 * finds `.git` — so the same root works unchanged on another machine.
 */
export type Home = { root: string; config: HomeConfig }

export { ConfigError }

const SCOPES: ToolScope[] = ['repo', 'machine', 'claude-plugin']

/** The tools every fleet gets. A `tools` list in the config adds to them. */
export const DEFAULT_TOOLS: ToolConfig[] = [
  {
    id: CODE_ATLAS,
    name: 'code-atlas',
    description:
      "Cartographie et audit d'un projet TypeScript : graphe des features, règles, score, audits IA. Lancé sur le dossier parent, il propose tes projets.",
    url: 'https://github.com/Vincweb/code-atlas',
    // Installed for the whole machine and started on the parent folder, where it offers the
    // projects; what it recorded in each clone shows in the list of repos (`atlas.ts`).
    scope: 'machine',
    run: 'npx @vincweb/code-atlas',
    install: { kind: 'npm-global', package: '@vincweb/code-atlas', from: 'npmjs' },
    detect: { command: 'code-atlas' },
  },
  {
    id: 'claude-context-viewer',
    name: 'claude-context-viewer',
    description:
      'Ce que Claude Code charge réellement dans une session, couche par couche, et la santé de la mémoire.',
    url: 'https://github.com/Vincweb/claude-context-viewer',
    scope: 'machine',
    run: 'npx claude-context-viewer',
    install: { kind: 'npm-global', package: 'claude-context-viewer', from: 'npmjs' },
    detect: { command: 'claude-context-viewer' },
  },
  {
    // Nothing to launch nor copy: « Piloter avec Claude » invites it. The card says where it stands.
    id: 'claude-code',
    name: 'Claude Code',
    description:
      'L’agent qui travaille dans tes repos ; Zeus lui répond par MCP. « Piloter avec Claude » ouvre une session sur ce dossier.',
    url: 'https://claude.com/claude-code',
    scope: 'machine',
    install: { kind: 'claude-code' },
    installHint: 'curl -fsSL https://claude.ai/install.sh | bash',
    detect: { command: 'claude' },
  },
]

const stringsOf = (value: unknown) =>
  asArray(value).filter((item): item is string => typeof item === 'string' && item !== '')

const toTool = (value: unknown, index: number): ToolConfig => {
  const tool = asRecord(value)
  const id = asString(tool?.id)
  const scope = SCOPES.find((candidate) => candidate === tool?.scope)
  if (!tool || !id || !scope) {
    throw new ConfigError(
      `${MARKER}/${CONFIG_FILE} : tools[${index}] doit avoir un "id" et un "scope" parmi ${SCOPES.join(', ')}`,
    )
  }
  const detect = asRecord(tool.detect)
  return {
    id,
    name: asString(tool.name) ?? id,
    description: asString(tool.description) ?? '',
    url: asString(tool.url) ?? undefined,
    scope,
    run: asString(tool.run) ?? undefined,
    // A recipe is what a click runs; a plain string is only ever shown, to be copied.
    install: toRecipe(tool.install, `${MARKER}/${CONFIG_FILE} : tools[${index}].install`),
    installHint: asString(tool.install) ?? undefined,
    detect: detect
      ? {
          files: stringsOf(detect.files),
          dependency: asString(detect.dependency) ?? undefined,
          plugin: asString(detect.plugin) ?? undefined,
          command: asString(detect.command) ?? undefined,
        }
      : undefined,
  }
}

/** A folder name people would give by hand: letters, digits, and a few quiet signs. */
export const SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u

const toFolders = (value: unknown) => {
  const folders: Record<string, string> = {}
  for (const [login, name] of Object.entries(asRecord(value) ?? {})) {
    if (typeof name !== 'string') continue
    if (!SEGMENT.test(name) || name.endsWith('.')) {
      throw new ConfigError(
        `${MARKER}/${CONFIG_FILE} : "${name}" n'est pas un nom de dossier simple`,
      )
    }
    folders[login.toLowerCase()] = name
  }
  return folders
}

/** A repository name as GitHub allows it. */
export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/

const toFollowedRepos = (value: unknown) => {
  const followed: Record<string, string[]> = {}
  for (const [login, names] of Object.entries(asRecord(value) ?? {})) {
    if (!Array.isArray(names)) continue
    const list: unknown[] = names
    const bad = list.find((name) => typeof name !== 'string' || !REPO_NAME.test(name))
    if (bad !== undefined) {
      throw new ConfigError(
        `${MARKER}/${CONFIG_FILE} : followedRepos.${login} — ${JSON.stringify(bad)} n'est pas un nom de repo`,
      )
    }
    followed[login.toLowerCase()] = list.map((name) => String(name).toLowerCase())
  }
  return followed
}

export const isHome = (dir: string) => isDirectory(path.join(dir, MARKER))

/** The root a folder belongs to: itself, or the nearest folder above it that holds `.zeus/`. */
export const findHome = (start: string): string | null => {
  let dir = path.resolve(start)
  for (;;) {
    if (isHome(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const configPath = (root: string) => path.join(root, MARKER, CONFIG_FILE)

const readConfig = (root: string) => {
  const file = configPath(root)
  if (!fs.existsSync(file)) return {}
  const config = asRecord(parseJson(fs.readFileSync(file, 'utf8')))
  if (!config) throw new ConfigError(`${file} n'est pas un objet JSON valide`)
  return config
}

/** Reads a root. A missing config file is the normal case, and means "nothing to add". */
export const loadHome = (root: string): Home => {
  if (!isHome(root)) {
    throw new ConfigError(`${root} n'est pas un dossier Zeus : il n'a pas de ${MARKER}/`)
  }
  const config = readConfig(root)
  const depth = asNumber(config.scanDepth) ?? 3
  return {
    root,
    config: {
      hiddenOwners: stringsOf(config.hiddenOwners).map((login) => login.toLowerCase()),
      followedRepos: toFollowedRepos(config.followedRepos),
      folders: toFolders(config.folders),
      scanDepth: Number.isInteger(depth) && depth >= 1 && depth <= 6 ? depth : 3,
      includeArchived: config.includeArchived === true,
      tools: asArray(config.tools).map(toTool),
    },
  }
}

/** Claude Code closes the list of tools: the others are there to serve it. */
const LAST_TOOL = 'claude-code'

/** The tools of a root: the defaults, with the config's own on top — and Claude Code last. */
export const toolsOf = (home: Home): ToolConfig[] => {
  const own = new Set(home.config.tools.map((tool) => tool.id))
  const all = [...DEFAULT_TOOLS.filter((tool) => !own.has(tool.id)), ...home.config.tools]
  return [
    ...all.filter((tool) => tool.id !== LAST_TOOL),
    ...all.filter((tool) => tool.id === LAST_TOOL),
  ]
}

/** The folder new clones of an account go to: the account's own name, unless the config renames it. */
export const folderFor = (home: Home, login: string) =>
  home.config.folders[login.toLowerCase()] ?? login

/** Whether a root follows a repository of an account it follows: every one, unless it names some. */
export const followsRepo = (home: Home, owner: string, name: string) => {
  const only = home.config.followedRepos[owner.toLowerCase()]
  return only === undefined || only.includes(name.toLowerCase())
}

/** The file is only written when there is something to say; with nothing to say, there is none. */
const writeConfig = (root: string, config: Record<string, unknown>) => {
  const file = configPath(root)
  if (Object.keys(config).length === 0) fs.rmSync(file, { force: true })
  else fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
}

/** Sets which accounts a root leaves out, keeping everything else the config holds. */
export const saveHiddenOwners = (root: string, hidden: string[]) => {
  const config = readConfig(root)
  if (hidden.length > 0) config.hiddenOwners = [...hidden].sort((a, b) => a.localeCompare(b))
  else delete config.hiddenOwners
  writeConfig(root, config)
}

/**
 * Sets which repositories of an account a root follows — `null` for every one, those to come
 * included — keeping everything else the config holds.
 */
export const saveFollowedRepos = (root: string, login: string, names: string[] | null) => {
  const config = readConfig(root)
  const key = login.toLowerCase()
  const followed = Object.fromEntries(
    Object.entries(asRecord(config.followedRepos) ?? {}).filter(
      ([other]) => other.toLowerCase() !== key,
    ),
  )
  if (names !== null) {
    followed[key] = [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }
  if (Object.keys(followed).length > 0) config.followedRepos = followed
  else delete config.followedRepos
  writeConfig(root, config)
}

export const expandTilde = (value: string) =>
  value === '~' || value.startsWith('~/') ? path.join(os.homedir(), value.slice(1)) : value

/** A path as people write it: `~/Documents/…` rather than `/Users/name/Documents/…`. */
export const tilde = (dir: string) => {
  const home = os.homedir()
  return dir === home || dir.startsWith(home + path.sep) ? `~${dir.slice(home.length)}` : dir
}

/** A root described from its marker alone — the welcome page must open at once. */
export const describeHome = (root: string, launch: string | null): HomeCandidate => {
  const base = { root, label: tilde(root), name: path.basename(root), isLaunch: root === launch }
  try {
    loadHome(root)
    return { ...base, error: null }
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    return { ...base, error: error.message }
  }
}

/** How many remembered folders the page may ask about in one request. */
const MAX_ALSO = 12

/**
 * The roots worth offering without being asked: the one Zeus was started in or beneath, and any
 * folder holding a `.zeus/` right under the current one. `also` are roots the page remembers
 * having opened; they are described whatever their state, so it can say why one no longer opens.
 */
export const discoverHomes = (launch: string | null, cwd: string, also: string[] = []) => {
  const found = new Set<string>()
  if (launch) found.add(launch)
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const child = path.join(cwd, entry.name)
      if (isHome(child)) found.add(child)
    }
  } catch {
    // An unreadable folder has nothing to offer.
  }
  for (const asked of also.slice(0, MAX_ALSO)) {
    if (asked.trim()) found.add(path.resolve(expandTilde(asked.trim())))
  }
  return [...found].map((root) => describeHome(root, launch))
}

/** What the path field gets back: the root described, or why the folder was refused. */
export const checkHome = (
  asked: string,
  launch: string | null,
): { candidate: HomeCandidate } | { error: string } => {
  const trimmed = asked.trim()
  if (!trimmed) return { error: "indique le chemin d'un dossier" }
  const dir = path.resolve(expandTilde(trimmed))
  if (!fs.existsSync(dir)) return { error: `rien à l'emplacement ${tilde(dir)}` }
  if (!isDirectory(dir)) return { error: `${tilde(dir)} est un fichier, pas un dossier` }
  // A folder inside a root opens that root: it is the same fleet, seen from further down.
  const root = findHome(dir)
  if (!root)
    return { error: `${tilde(dir)} n'est pas un dossier Zeus : aucun ${MARKER}/ ici ni au-dessus` }
  const candidate = describeHome(root, launch)
  return candidate.error === null ? { candidate } : { error: candidate.error }
}
