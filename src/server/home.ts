import fs from 'fs'
import os from 'os'
import path from 'path'
import type { HomeCandidate, ToolConfig, ToolScope } from '../shared/types'
import { isDirectory } from './folders'
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

/** Something the user has to fix: the message is shown as it is, in the terminal and on the page. */
export class ConfigError extends Error {}

const SCOPES: ToolScope[] = ['repo', 'machine', 'claude-plugin']

/** The tools every fleet gets. A `tools` list in the config adds to them. */
export const DEFAULT_TOOLS: ToolConfig[] = [
  {
    id: 'code-atlas',
    name: 'code-atlas',
    description:
      "Cartographie et audit d'un projet TypeScript : graphe des features, règles, score, audits IA.",
    url: 'https://github.com/Vincweb/code-atlas',
    scope: 'repo',
    run: 'npx @vincweb/code-atlas',
    install: 'npm install -D @vincweb/code-atlas',
    detect: {
      files: ['code-atlas.json', '.code-atlas/baseline.json'],
      dependency: '@vincweb/code-atlas',
    },
  },
  {
    id: 'claude-context-viewer',
    name: 'claude-context-viewer',
    description:
      'Ce que Claude Code charge réellement dans une session, couche par couche, et la santé de la mémoire.',
    url: 'https://github.com/Vincweb/claude-context-viewer',
    scope: 'machine',
    run: 'npx claude-context-viewer',
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
    install: asString(tool.install) ?? undefined,
    detect: detect
      ? {
          files: stringsOf(detect.files),
          dependency: asString(detect.dependency) ?? undefined,
          plugin: asString(detect.plugin) ?? undefined,
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
      folders: toFolders(config.folders),
      scanDepth: Number.isInteger(depth) && depth >= 1 && depth <= 6 ? depth : 3,
      includeArchived: config.includeArchived === true,
      tools: asArray(config.tools).map(toTool),
    },
  }
}

/** The tools of a root: the defaults, with the config's own on top. */
export const toolsOf = (home: Home): ToolConfig[] => {
  const own = new Set(home.config.tools.map((tool) => tool.id))
  return [...DEFAULT_TOOLS.filter((tool) => !own.has(tool.id)), ...home.config.tools]
}

/** The folder new clones of an account go to: the account's own name, unless the config renames it. */
export const folderFor = (home: Home, login: string) =>
  home.config.folders[login.toLowerCase()] ?? login

/**
 * Sets which accounts a root leaves out, keeping everything else the config holds. The file is
 * only written when there is something to say; with nothing hidden and nothing else, there is none.
 */
export const saveHiddenOwners = (root: string, hidden: string[]) => {
  const config = readConfig(root)
  if (hidden.length > 0) config.hiddenOwners = [...hidden].sort((a, b) => a.localeCompare(b))
  else delete config.hiddenOwners
  const file = configPath(root)
  if (Object.keys(config).length === 0) fs.rmSync(file, { force: true })
  else fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
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
