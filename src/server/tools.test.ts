import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import type { LocalRepo, RepoStatus, ToolConfig } from '../shared/types'
import { launchInClone } from './install'
import { readTools } from './tools'

/** A clone with these files, each holding `{}` or the JSON given. */
const clone = (id: string, files: Record<string, unknown>): RepoStatus => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-tools-'))
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), JSON.stringify(content))
  }
  return { id, local: { path: dir, relativePath: id } as LocalRepo } as RepoStatus
}

const atlas: ToolConfig = {
  id: 'atlas',
  name: 'atlas',
  description: '',
  scope: 'repo',
  install: { kind: 'dev-dependency', package: '@acme/atlas' },
  // A program no machine has: installed for the whole machine, it would be on the PATH.
  detect: { files: ['atlas.json'], dependency: '@acme/atlas', command: 'zeus-test-absent-program' },
}

test('launches a project’s tool only where it is installed, not where a config file names it', () => {
  const configured = clone('acme/configured', { 'atlas.json': {}, 'package.json': {} })
  const depends = clone('acme/depends', {
    'package.json': { devDependencies: { '@acme/atlas': '^1.0.0' } },
  })
  const bare = clone('acme/bare', { 'package.json': {} })
  const [tool] = readTools([atlas], [configured, depends, bare])
  assert.deepEqual(tool?.repos, ['acme/configured', 'acme/depends'])
  assert.deepEqual(tool?.runnable, ['acme/depends'])
  assert.equal(tool?.global, false)
  assert.deepEqual(tool?.installable, ['acme/bare'])
})

test('starts a project’s tool with npx where the clone depends on it, by its program elsewhere', () => {
  assert.deepEqual(launchInClone(atlas, true), ['npx', '@acme/atlas'])
  assert.deepEqual(launchInClone(atlas, false), ['zeus-test-absent-program'])
  assert.equal(launchInClone({ ...atlas, detect: {} }, false), null)
})
