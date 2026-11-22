import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import type { LocalRepo, ToolConfig } from '../shared/types'
import { ConfigError } from './errors'
import type { ExecResult } from './exec'
import {
  installTool,
  launchOf,
  packageManagerOf,
  planInstall,
  previewInstall,
  registryHint,
  toRecipe,
} from './install'

const project = (...files: string[]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-install-'))
  for (const file of files) fs.writeFileSync(path.join(dir, file), '{}')
  return dir
}

const ok: ExecResult = { ok: true, code: 0, stdout: '', stderr: '', timedOut: false }
const failed = (stderr: string): ExecResult => ({ ...ok, ok: false, code: 1, stderr })

/** A runner that records what it was asked, and answers as told. */
const recorder = (answers: Record<string, ExecResult> = {}) => {
  const calls: { line: string; cwd: string }[] = []
  const run = (command: string, args: string[], { cwd }: { cwd: string }) => {
    const line = [command, ...args].join(' ')
    calls.push({ line, cwd })
    return Promise.resolve(answers[line] ?? ok)
  }
  return { calls, run }
}

const tool = (install: ToolConfig['install']): ToolConfig => ({
  id: 'outil',
  name: 'Outil',
  description: '',
  scope: 'repo',
  install,
})

const clone = (dir: string, modifiedFiles = 0) =>
  ({ path: dir, relativePath: 'Sites/App', modifiedFiles }) as LocalRepo

test('reads a recipe, and refuses a name that is not only a name', () => {
  assert.deepEqual(toRecipe({ kind: 'dev-dependency', package: '@vincweb/code-atlas' }, 'x'), {
    kind: 'dev-dependency',
    package: '@vincweb/code-atlas',
  })
  assert.deepEqual(
    toRecipe({ kind: 'claude-plugin', plugin: 'a@b', marketplace: 'Vincweb/caudron-plugin' }, 'x'),
    { kind: 'claude-plugin', plugin: 'a@b', marketplace: 'Vincweb/caudron-plugin' },
  )
  // A string is a command to show, not a recipe to run.
  assert.equal(toRecipe('npm install -g thing', 'x'), undefined)
  assert.equal(toRecipe(undefined, 'x'), undefined)

  const refused = (value: unknown) => assert.throws(() => toRecipe(value, 'x'), ConfigError)
  refused({ kind: 'shell', run: 'rm -rf /' })
  refused({ kind: 'npm-global', package: '--registry=https://evil.example' })
  refused({ kind: 'npm-global', package: 'thing; rm -rf /' })
  refused({ kind: 'dev-dependency', package: 'thing@latest' })
  refused({ kind: 'dev-dependency' })
  refused({ kind: 'claude-plugin', plugin: 'no-marketplace' })
  refused({ kind: 'claude-plugin', plugin: 'a@b', marketplace: 'https://evil.example/x.git' })
})

test('adds a development dependency with the manager the project already uses', () => {
  assert.equal(packageManagerOf(project('package.json')), 'npm')
  assert.equal(packageManagerOf(project('package.json', 'bun.lock')), 'bun')
  assert.equal(packageManagerOf(project('package.json', 'pnpm-lock.yaml')), 'pnpm')
  assert.equal(packageManagerOf(project('package.json', 'yarn.lock')), 'yarn')

  const lines = (dir: string) =>
    planInstall({ kind: 'dev-dependency', package: 'thing' }, dir).map((step) =>
      [step.command, ...step.args].join(' '),
    )
  assert.deepEqual(lines(project('package.json', 'bun.lock')), ['bun add -d thing'])
  assert.deepEqual(lines(project('package.json', 'pnpm-lock.yaml')), ['pnpm add -D thing'])
  assert.deepEqual(lines(project('package.json')), ['npm install -D thing'])
  assert.deepEqual(previewInstall({ kind: 'dev-dependency', package: 'thing' }), [
    'npm install -D thing',
  ])
})

test('installs a development dependency in the clone, and says what is left to commit', async () => {
  const dir = project('package.json', 'pnpm-lock.yaml')
  const { calls, run } = recorder()
  const result = await installTool(
    tool({ kind: 'dev-dependency', package: 'thing' }),
    { root: '/root', repoId: 'Vincweb/app', clone: clone(dir) },
    run,
  )
  assert.deepEqual(calls, [{ line: 'pnpm add -D thing', cwd: dir }])
  assert.equal(result.ok, true)
  assert.equal(result.repo, 'Vincweb/app')
  assert.match(result.message, /Sites\/App avec pnpm/)
})

test('leaves a clone alone when the change could not be told apart, or is not a project', async () => {
  const { calls, run } = recorder()
  const recipe = tool({ kind: 'dev-dependency', package: 'thing' })
  const target = (dir: string | null, modified = 0) => ({
    root: '/root',
    repoId: dir ? 'Vincweb/app' : null,
    clone: dir ? clone(dir, modified) : null,
  })

  assert.match((await installTool(recipe, target(null), run)).message, /choisis le repo/)
  assert.match((await installTool(recipe, target(project()), run)).message, /package\.json/)
  const busy = await installTool(recipe, target(project('package.json'), 2), run)
  assert.equal(busy.ok, false)
  assert.match(busy.message, /2 fichiers modifiés/)
  assert.match((await installTool(tool(undefined), target(null), run)).message, /recette/)
  assert.deepEqual(calls, [])
})

test('installs a plugin after its marketplace, which may well be there already', async () => {
  const add = 'claude plugin marketplace add Vincweb/caudron-plugin'
  const { calls, run } = recorder({ [add]: failed('marketplace already exists') })
  const result = await installTool(
    tool({
      kind: 'claude-plugin',
      plugin: 'caudron-plugin@caudron',
      marketplace: 'Vincweb/caudron-plugin',
    }),
    { root: '/root', repoId: null, clone: null },
    run,
  )
  assert.deepEqual(
    calls.map((call) => call.line),
    [add, 'claude plugin install caudron-plugin@caudron'],
  )
  assert.equal(calls[1]?.cwd, '/root')
  assert.equal(result.ok, true)
  assert.deepEqual(
    result.steps.map((step) => step.ok),
    [false, true],
  )
})

test('stops at the command that fails, and passes on what it said', async () => {
  const line = 'npm install -g claude-context-viewer'
  const { run } = recorder({ [line]: failed('npm error code E404\nnpm error 404 Not Found') })
  const result = await installTool(
    tool({ kind: 'npm-global', package: 'claude-context-viewer' }),
    { root: '/root', repoId: null, clone: null },
    run,
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /a échoué : le paquet est introuvable dans le registre npm/)
  assert.match(result.steps[0]?.output ?? '', /404 Not Found/)

  const missing = recorder({ [line]: { ...ok, ok: false, code: null } })
  const none = await installTool(
    tool({ kind: 'npm-global', package: 'claude-context-viewer' }),
    { root: '/root', repoId: null, clone: null },
    missing.run,
  )
  assert.match(none.steps[0]?.output ?? '', /npm est introuvable/)
})

test('names the registry that answered 404, which is where a scope sent elsewhere shows', () => {
  const pnpm =
    '[ERR_PNPM_FETCH_404] GET https://npm.pkg.github.com/@acme%2Ftool: Not Found - 404\n@acme/tool is not in the npm registry'
  assert.match(registryHint(pnpm) ?? '', /introuvable sur npm\.pkg\.github\.com/)
  assert.equal(registryHint('npm error code EACCES'), null)
  // A port or a version that merely holds the digits is not a 404.
  assert.equal(registryHint('added 1404 packages'), null)
})

test('launches a tool from its recipe, never from the free text of its config', () => {
  assert.deepEqual(launchOf(tool({ kind: 'dev-dependency', package: '@vincweb/code-atlas' })), [
    'npx',
    '@vincweb/code-atlas',
  ])
  const viewer = (command: string) => ({
    ...tool({ kind: 'npm-global', package: 'viewer' }),
    scope: 'machine' as const,
    detect: { command },
  })
  assert.deepEqual(launchOf(viewer('claude-context-viewer')), ['claude-context-viewer'])
  // A program name only: a path, an option or a second command is not launched.
  for (const command of ['/bin/sh', '-rf', 'viewer; rm -rf ~', 'a b']) {
    assert.equal(launchOf(viewer(command)), null, command)
  }
  assert.equal(launchOf(tool({ kind: 'claude-plugin', plugin: 'p@m' })), null)
  assert.equal(launchOf({ ...tool(undefined), run: 'rm -rf ~' }), null)
})

test('updates a machine package to its latest, a plugin after its catalog, and never a project', async () => {
  const global = recorder()
  const updated = await installTool(
    tool({ kind: 'npm-global', package: 'claude-context-viewer' }),
    { root: '/root', repoId: null, clone: null, update: true },
    global.run,
  )
  assert.deepEqual(
    global.calls.map((call) => call.line),
    ['npm install -g claude-context-viewer@latest'],
  )
  assert.equal(updated.message, 'mis à jour pour toute la machine')

  const catalog = 'claude plugin marketplace update caudron'
  const plugin = recorder({ [catalog]: failed('offline') })
  const result = await installTool(
    tool({ kind: 'claude-plugin', plugin: 'caudron-plugin@caudron' }),
    { root: '/root', repoId: null, clone: null, update: true },
    plugin.run,
  )
  assert.deepEqual(
    plugin.calls.map((call) => call.line),
    [catalog, 'claude plugin update caudron-plugin@caudron'],
  )
  assert.equal(result.ok, true)

  const project = recorder()
  const refused = await installTool(
    tool({ kind: 'dev-dependency', package: 'code-atlas' }),
    { root: '/root', repoId: 'acme/app', clone: null, update: true },
    project.run,
  )
  assert.equal(refused.ok, false)
  assert.deepEqual(project.calls, [])
})

test('launches Claude Code, updates it with its own command, and never runs its installer', async () => {
  const claude = { ...tool(toRecipe({ kind: 'claude-code' }, 'test')), scope: 'machine' as const }
  assert.deepEqual(launchOf(claude), ['claude'])
  const update = recorder()
  const updated = await installTool(
    claude,
    { root: '/root', repoId: null, clone: null, update: true },
    update.run,
  )
  assert.deepEqual(
    update.calls.map((call) => call.line),
    ['claude update'],
  )
  assert.equal(updated.ok, true)
  const install = recorder()
  const refused = await installTool(
    claude,
    { root: '/root', repoId: null, clone: null },
    install.run,
  )
  assert.equal(refused.ok, false)
  assert.deepEqual(install.calls, [])
})
