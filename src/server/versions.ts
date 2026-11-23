import fs from 'fs'
import path from 'path'
import type { ToolConfig, ToolVersion, ZeusUpgrade, ZeusVersion } from '../shared/types'
import { exec } from './exec'
import { previewUpdate, registryArgs } from './install'
import { asArray, asString, at, parseJson } from './json'
import { NPX_COMMAND, ZEUS_PACKAGE, cliFile, fetchedByNpx } from './selfCommand'
import { pluginVersion } from './tools'

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/

/**
 * Whether `latest` is a later release than `installed`. The three numbers are compared in order,
 * and a pre-release comes before the release it leads to. Anything that is not a version says no:
 * « different » is not « older ».
 */
export const isNewer = (latest: string, installed: string) => {
  const a = VERSION.exec(latest.trim())
  const b = VERSION.exec(installed.trim())
  if (!a || !b) return false
  for (const index of [1, 2, 3]) {
    const difference = Number(a[index]) - Number(b[index])
    if (difference !== 0) return difference > 0
  }
  const [aPre, bPre] = [a[4], b[4]]
  if (aPre === bPre) return false
  if (aPre === undefined) return true
  if (bPre === undefined) return false
  return aPre.localeCompare(bPre, 'en', { numeric: true }) > 0
}

/** What the registry and GitHub said is good for an hour: releases are not made by the minute. */
const LATEST_GOOD_FOR_MS = 60 * 60 * 1000
const latestKept = new Map<string, { at: number; version: string | null }>()

const remembered = async (key: string, read: () => Promise<string | null>) => {
  const kept = latestKept.get(key)
  if (kept && Date.now() - kept.at < LATEST_GOOD_FOR_MS) return kept.version
  const version = await read().catch(() => null)
  // A failed read is not kept: offline now does not mean offline in a minute.
  if (version !== null) latestKept.set(key, { at: Date.now(), version })
  return version
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.trim() || null

/** Past this, the registry or GitHub is taken not to answer: the tool shows no version, that is all. */
const LOOKUP_TIMEOUT_MS = 6000

/** The latest release of an npm package, as the registry this machine uses says. */
const npmLatest = (name: string, from?: 'npmjs') =>
  remembered(`npm:${name}:${from ?? ''}`, async () => {
    const result = await exec(
      'npm',
      ['view', name, 'version', ...registryArgs({ package: name, from })],
      { timeoutMs: LOOKUP_TIMEOUT_MS },
    )
    return result.ok ? firstLine(result.stdout) : null
  })

let globalRoot: string | null = null

/** Where npm puts the packages installed for the whole machine. Kept once npm has said. */
const npmGlobalRoot = async () => {
  if (globalRoot === null) {
    const result = await exec('npm', ['root', '-g'], { timeoutMs: LOOKUP_TIMEOUT_MS })
    globalRoot = result.ok ? firstLine(result.stdout) : null
  }
  return globalRoot
}

/**
 * The same folder, as a real path. Node names the file it runs by its real path, and the global
 * root may be reached through a link (Homebrew, nvm).
 */
const realGlobalRoot = async () => {
  const root = await npmGlobalRoot()
  if (root === null) return null
  try {
    return fs.realpathSync(root)
  } catch {
    return root
  }
}

/** The version Claude Code says it is: `2.1.289 (Claude Code)`. */
const claudeInstalled = async () => {
  const result = await exec('claude', ['--version'], { timeoutMs: LOOKUP_TIMEOUT_MS })
  return result.ok ? (VERSION.exec(result.stdout.trim())?.[0] ?? null) : null
}

/** Its releases are published on npm too, whatever installer put it on this machine. */
const CLAUDE_CODE_PACKAGE = '@anthropic-ai/claude-code'

/** The version of a package installed for the whole machine, read off its package.json. */
const npmInstalled = async (name: string) => {
  const root = await npmGlobalRoot()
  if (!root) return null
  try {
    return asString(
      at(parseJson(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8')), 'version'),
    )
  } catch {
    return null
  }
}

/** A file of a GitHub repository, as text, read with the user's own `gh`. */
const githubFile = async (repository: string, file: string) => {
  const result = await exec(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repository}/contents/${file}`],
    { timeoutMs: LOOKUP_TIMEOUT_MS },
  )
  return result.ok ? parseJson(result.stdout) : undefined
}

/** A folder of the marketplace's own repository, as a catalog may name it: `./`, `./plugins/x`. */
const SOURCE = /^\.\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/?)*$/

/**
 * What a marketplace's catalog says of a plugin: its version, or — for a plugin kept in a folder
 * of the same repository without one — the manifest to read it from. The catalog is someone else's
 * text: a source that is not a plain folder of that repository gives nothing.
 */
export const catalogEntry = (
  catalog: unknown,
  name: string,
): { version: string } | { manifest: string } | null => {
  const entry = asArray(at(catalog, 'plugins')).find((item) => at(item, 'name') === name)
  const version = asString(at(entry, 'version'))
  if (version) return { version }
  const source = asString(at(entry, 'source'))
  if (!source || !SOURCE.test(source)) return null
  const folder = source.replace(/^\.\//, '').replace(/\/$/, '')
  return { manifest: `${folder ? `${folder}/` : ''}.claude-plugin/plugin.json` }
}

/** The version a marketplace offers for a plugin, read on GitHub. */
const pluginLatest = (plugin: string, marketplace: string) =>
  remembered(`plugin:${plugin}:${marketplace}`, async () => {
    const catalog = await githubFile(marketplace, '.claude-plugin/marketplace.json')
    const entry = catalogEntry(catalog, plugin.slice(0, plugin.indexOf('@')))
    if (!entry) return null
    if ('version' in entry) return entry.version
    return asString(at(await githubFile(marketplace, entry.manifest), 'version'))
  })

/** Where one installed tool stands against its latest release, or null when nothing can tell. */
const versionOf = async (tool: ToolConfig): Promise<ToolVersion | null> => {
  const recipe = tool.install
  // A project's tool is left out: its version in each project is that project's business.
  const found =
    recipe?.kind === 'npm-global'
      ? {
          installed: await npmInstalled(recipe.package),
          latest: () => npmLatest(recipe.package, recipe.from),
        }
      : recipe?.kind === 'claude-code'
        ? {
            installed: await claudeInstalled(),
            latest: () => npmLatest(CLAUDE_CODE_PACKAGE, 'npmjs'),
          }
        : recipe?.kind === 'claude-plugin' && recipe.marketplace
          ? {
              installed: pluginVersion(recipe.plugin),
              latest: () => pluginLatest(recipe.plugin, recipe.marketplace ?? ''),
            }
          : null
  // Nothing installed, nothing to compare: the registry is not even asked.
  if (!found?.installed) return null
  const { installed } = found
  const latest = await found.latest()
  return { installed, latest, outdated: latest !== null && isNewer(latest, installed) }
}

/**
 * How the installed tools of the machine and of Claude Code compare with their latest release.
 * Slow — npm and GitHub are asked — so it is its own request, answered once the page is up; a
 * lookup that fails leaves its tool out rather than raising a warning.
 */
export const readToolVersions = async (tools: ToolConfig[]) => {
  const versions: Record<string, ToolVersion> = {}
  const found = await Promise.all(
    tools.map(async (tool) => [tool.id, await versionOf(tool)] as const),
  )
  for (const [id, version] of found) if (version) versions[id] = version
  return versions
}

/**
 * How to get the latest Zeus, by the way the CLI found at `here` runs. Fetched by npx, the same
 * command asked for `@latest`: npm 11 checks a bare name against the registry before it reuses its
 * cache, and `@latest` asks the same of any npm. Installed by npm for the whole machine — under
 * `realRoot`, its global folder as a real path — the install that updates any tool of the machine.
 * From a folder of its own — its sources, a build — or another installer, Zeus is updated with that
 * folder or that installer: null.
 */
export const upgradeAt = (here: string, realRoot: string | null): ZeusUpgrade | null => {
  if (fetchedByNpx(here)) return { via: 'npx', command: `${NPX_COMMAND}@latest` }
  const isGlobalInstall =
    realRoot !== null && here.startsWith(path.join(realRoot, ZEUS_PACKAGE) + path.sep)
  if (!isGlobalInstall) return null
  const [command] = previewUpdate({ kind: 'npm-global', package: ZEUS_PACKAGE, from: 'npmjs' })
  return command ? { via: 'npm', command } : null
}

/**
 * How this Zeus compares with its latest release on npm and, when a later one exists, how to get
 * it — asked of npm only then, since it costs a command. Null when the running version is not one
 * (empty, or read from nowhere) or npm did not answer: nothing to say rather than a warning.
 */
export const readZeusVersion = async (installed: string): Promise<ZeusVersion | null> => {
  if (!VERSION.test(installed.trim())) return null
  const latest = await npmLatest(ZEUS_PACKAGE, 'npmjs')
  if (latest === null) return null
  const outdated = isNewer(latest, installed)
  return {
    installed,
    latest,
    outdated,
    upgrade: outdated ? upgradeAt(cliFile(), await realGlobalRoot()) : null,
  }
}
