import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import { findRepos, parseStatus } from './local'

test('reads the branch, its upstream and the changed paths', () => {
  const status = parseStatus(
    [
      '# branch.oid 33b4ed03a14547ba2d0be7887d71707f16818ffe',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -5',
      '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
      '1 M. N... 100644 100644 100644 aaa bbb src/b.ts',
      '? notes.md',
      '',
    ].join('\n'),
  )
  assert.deepEqual(status, {
    headOid: '33b4ed03a14547ba2d0be7887d71707f16818ffe',
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 5,
    dirtyFiles: 3,
    modifiedFiles: 2,
  })
})

test('leaves ahead and behind unknown without an upstream', () => {
  const status = parseStatus('# branch.oid abc\n# branch.head main\n')
  assert.equal(status.upstream, null)
  assert.equal(status.ahead, null)
  assert.equal(status.behind, null)
})

test('reads a repository without a commit, and a detached HEAD', () => {
  assert.equal(parseStatus('# branch.oid (initial)\n# branch.head main\n').headOid, null)
  assert.equal(parseStatus('# branch.oid abc\n# branch.head (detached)\n').branch, null)
})

test('finds nested repositories and skips hidden folders and node_modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-find-'))
  const mk = (...parts: string[]) => fs.mkdirSync(path.join(root, ...parts), { recursive: true })
  mk('Meta', '.git')
  mk('Meta', 'Sub', '.git')
  mk('Meta', '.claude', 'worktrees', 'copy', '.git')
  mk('Meta', 'node_modules', 'dep', '.git')
  mk('Folder', 'App', '.git')
  mk('Folder', 'Deep', 'Deeper', 'TooDeep', '.git')
  mk('Plain', 'src')

  assert.deepEqual(
    findRepos(root, 3).map((dir) => path.relative(root, dir)),
    ['Folder/App', 'Meta', 'Meta/Sub'],
  )
  fs.rmSync(root, { recursive: true, force: true })
})
