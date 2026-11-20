import fs from 'fs'
import os from 'os'
import path from 'path'
import type { RepoStatus, ToolConfig, ToolStatus } from '../shared/types'
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
const pluginVersion = (plugin: string) => {
  const installed = readJson(path.join(claudeHome(), 'plugins', 'installed_plugins.json'))
  const entry = asArray(at(installed, 'plugins', plugin))[0]
  return entry === undefined ? null : (asString(at(entry, 'version')) ?? 'installé')
}

const dependsOn = (dir: string, dependency: string) => {
  const manifest = asRecord(readJson(path.join(dir, 'package.json')))
  return ['dependencies', 'devDependencies'].some(
    (field) => asRecord(manifest?.[field])?.[dependency] !== undefined,
  )
}

/** Whether one clone carries what the tool leaves behind: a config file, or a dependency. */
const isSetUpIn = (dir: string, detect: NonNullable<ToolConfig['detect']>) =>
  (detect.files ?? []).some((file) => fs.existsSync(path.join(dir, file))) ||
  (detect.dependency !== undefined && dependsOn(dir, detect.dependency))

/**
 * Where each tool of the workspace stands. Detection only reads what is already on disk; a tool
 * fetched on demand (`npx …`) leaves nothing to find, and says so with `installed: null`.
 */
export const readTools = (tools: ToolConfig[], repos: RepoStatus[]): ToolStatus[] =>
  tools.map((tool) => {
    if (tool.scope === 'claude-plugin') {
      const version = tool.detect?.plugin ? pluginVersion(tool.detect.plugin) : null
      return {
        ...tool,
        installed: tool.detect?.plugin ? version !== null : null,
        version,
        repos: [],
      }
    }
    if (tool.scope === 'repo' && tool.detect) {
      const detect = tool.detect
      const equipped = repos
        .filter((repo) => repo.local !== null && isSetUpIn(repo.local.path, detect))
        .map((repo) => repo.id)
      return { ...tool, installed: equipped.length > 0, version: null, repos: equipped }
    }
    return { ...tool, installed: null, version: null, repos: [] }
  })
