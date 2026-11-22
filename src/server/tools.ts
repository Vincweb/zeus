import fs from 'fs'
import os from 'os'
import path from 'path'
import type { RepoStatus, ToolConfig, ToolStatus } from '../shared/types'
import { isNpmProject, launchOf, previewInstall, previewUpdate } from './install'
import { asArray, asRecord, asString, at, parseJson } from './json'

const readJson = (file: string) => {
  try {
    return parseJson(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** Where Claude Code keeps its own state. Read, never written. */
const claudeHome = () => process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')

/** The installed version of a Claude Code plugin, `name@marketplace`, or null without one. */
export const pluginVersion = (plugin: string) => {
  const installed = readJson(path.join(claudeHome(), 'plugins', 'installed_plugins.json'))
  const entry = asArray(at(installed, 'plugins', plugin))[0]
  return entry === undefined ? null : (asString(at(entry, 'version')) ?? 'installé')
}

export const dependsOn = (dir: string, dependency: string) => {
  const manifest = asRecord(readJson(path.join(dir, 'package.json')))
  return ['dependencies', 'devDependencies'].some(
    (field) => asRecord(manifest?.[field])?.[dependency] !== undefined,
  )
}

/** Whether one clone carries what the tool leaves behind: a config file, or a dependency. */
const isSetUpIn = (dir: string, detect: NonNullable<ToolConfig['detect']>) =>
  (detect.files ?? []).some((file) => fs.existsSync(path.join(dir, file))) ||
  (detect.dependency !== undefined && dependsOn(dir, detect.dependency))

/** Whether a program is there to be run: a file by that name, executable, in a folder of the PATH. */
const onPath = (command: string) =>
  (process.env.PATH ?? '').split(path.delimiter).some((dir) => {
    try {
      fs.accessSync(path.join(dir, command), fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  })

/**
 * Where each tool stands. Detection only reads what is already on disk; a tool fetched on demand
 * (`npx …`) leaves nothing to find, and says so with `installed: null`.
 */
export const readTools = (tools: ToolConfig[], repos: RepoStatus[]): ToolStatus[] =>
  tools.map((tool): ToolStatus => {
    const installCommands = tool.install ? previewInstall(tool.install) : []
    const blank = {
      ...tool,
      version: null,
      repos: [],
      installCommands,
      installable: [],
      global: null,
      runnable: [],
      launch: launchOf(tool)?.join(' ') ?? null,
      updateCommands: tool.install ? previewUpdate(tool.install) : [],
    }
    if (tool.scope === 'claude-plugin') {
      const version = tool.detect?.plugin ? pluginVersion(tool.detect.plugin) : null
      return { ...blank, installed: tool.detect?.plugin ? version !== null : null, version }
    }
    if (tool.scope === 'repo' && tool.detect) {
      const detect = tool.detect
      const cloned = repos.filter((repo) => repo.local !== null)
      const equipped = cloned.filter((repo) => repo.local && isSetUpIn(repo.local.path, detect))
      const has = new Set(equipped.map((repo) => repo.id))
      const global = detect.command ? onPath(detect.command) : null
      return {
        ...blank,
        installed: equipped.length > 0,
        repos: equipped.map((repo) => repo.id),
        global,
        runnable: equipped
          .filter(
            (repo) =>
              global === true ||
              (detect.dependency !== undefined &&
                repo.local !== null &&
                dependsOn(repo.local.path, detect.dependency)),
          )
          .map((repo) => repo.id),
        // Where a click could put it: an npm project that does not have it yet.
        installable:
          tool.install?.kind === 'dev-dependency'
            ? cloned
                .filter((repo) => !has.has(repo.id) && repo.local && isNpmProject(repo.local.path))
                .map((repo) => repo.id)
            : [],
      }
    }
    if (tool.scope === 'machine' && tool.detect?.command) {
      return { ...blank, installed: onPath(tool.detect.command) }
    }
    return { ...blank, installed: null }
  })
