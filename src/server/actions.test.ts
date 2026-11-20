import assert from 'node:assert/strict'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import type { RepoStatus, StatusPayload } from '../shared/types'
import { cloneRepo, gitClone, safeFolder, updateClone } from './actions'
import { readBranchStatus } from './local'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Zeus',
      GIT_AUTHOR_EMAIL: 'zeus@example.test',
      GIT_COMMITTER_NAME: 'Zeus',
      GIT_COMMITTER_EMAIL: 'zeus@example.test',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  }).trim()

const commit = (dir: string, file: string, content: string) => {
  fs.writeFileSync(path.join(dir, file), content)
  git(dir, 'add', '--', file)
  git(dir, 'commit', '--quiet', '-m', `write ${file}`)
}

/** A bare "GitHub", a clone that pushes to it, and a folder for the clone under test. */
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-actions-'))
  const origin = path.join(root, 'origin.git')
  const author = path.join(root, 'author')
  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin)
  git(root, 'clone', '--quiet', origin, author)
  commit(author, 'README.md', 'one\n')
  git(author, 'push', '--quiet', 'origin', 'HEAD:main')
  const pushMore = (file: string, content: string) => {
    commit(author, file, content)
    git(author, 'push', '--quiet', 'origin', 'HEAD:main')
  }
  return { root, origin, clone: path.join(root, 'clone'), pushMore }
}

test('clones into a new folder, and refuses one that exists', async () => {
  const { origin, clone } = fixture()
  assert.equal((await gitClone(origin, clone)).outcome, 'cloned')
  assert.ok(fs.existsSync(path.join(clone, 'README.md')))
  assert.equal((await gitClone(origin, clone)).outcome, 'failed')
})

test('fast-forwards a clean clone, then finds nothing more to do', async () => {
  const { origin, clone, pushMore } = fixture()
  await gitClone(origin, clone)
  pushMore('a.txt', 'a\n')
  pushMore('b.txt', 'b\n')

  const first = await updateClone(clone)
  assert.equal(first.outcome, 'updated')
  assert.match(first.message, /2 commits/)
  assert.ok(fs.existsSync(path.join(clone, 'b.txt')))
  assert.equal((await updateClone(clone)).outcome, 'up-to-date')
})

test('fetches but leaves a clone with modified files where it was', async () => {
  const { origin, clone, pushMore } = fixture()
  await gitClone(origin, clone)
  const before = git(clone, 'rev-parse', 'HEAD')
  fs.writeFileSync(path.join(clone, 'README.md'), 'edited locally\n')
  pushMore('a.txt', 'a\n')

  assert.equal((await updateClone(clone)).outcome, 'fetched-dirty')
  assert.equal(git(clone, 'rev-parse', 'HEAD'), before)
  assert.equal(fs.readFileSync(path.join(clone, 'README.md'), 'utf8'), 'edited locally\n')
  assert.equal((await readBranchStatus(clone))?.behind, 1)
})

test('an untracked file does not stand in the way of a fast-forward', async () => {
  const { origin, clone, pushMore } = fixture()
  await gitClone(origin, clone)
  fs.writeFileSync(path.join(clone, 'notes.txt'), 'mine\n')
  pushMore('a.txt', 'a\n')

  assert.equal((await updateClone(clone)).outcome, 'updated')
  assert.equal(fs.readFileSync(path.join(clone, 'notes.txt'), 'utf8'), 'mine\n')
})

test('never merges a branch that has diverged', async () => {
  const { origin, clone, pushMore } = fixture()
  await gitClone(origin, clone)
  commit(clone, 'local.txt', 'local\n')
  const before = git(clone, 'rev-parse', 'HEAD')
  pushMore('a.txt', 'a\n')

  assert.equal((await updateClone(clone)).outcome, 'diverged')
  assert.equal(git(clone, 'rev-parse', 'HEAD'), before)
})

test('says so when the branch follows nothing', async () => {
  const { origin, clone } = fixture()
  await gitClone(origin, clone)
  git(clone, 'switch', '--quiet', '-c', 'solo')
  assert.equal((await updateClone(clone)).outcome, 'fetched-no-upstream')
})

test('accepts plain folder names, a few levels deep, and nothing that climbs or hides', () => {
  assert.equal(safeFolder(''), '')
  assert.equal(safeFolder('AtelierPerso'), 'AtelierPerso')
  assert.equal(safeFolder('/Sites//Vitrine/'), 'Sites/Vitrine')
  assert.equal(safeFolder('Outils Claude'), 'Outils Claude')
  assert.equal(safeFolder('Équipe-2'), 'Équipe-2')
  assert.equal(safeFolder('..'), null)
  assert.equal(safeFolder('a/../b'), null)
  assert.equal(safeFolder('.git'), null)
  assert.equal(safeFolder('a/.hidden'), null)
  assert.equal(safeFolder('a/b/c/d'), null)
  assert.equal(safeFolder('nom.'), null)
  assert.equal(safeFolder('a\\b'), null)
})

test('clones into the folder of the owning account, creating it, and never outside the root', async () => {
  const { root, origin } = fixture()
  const fleet = path.join(root, 'fleet')
  fs.mkdirSync(fleet)
  const status = {
    home: { root: fleet, folders: ['', 'Existant'], cloneProtocol: 'https' },
    workspaces: [{ login: 'acme', kind: 'org', label: 'acme', folder: 'acme', hidden: false }],
  } as StatusPayload
  const repo = (name: string) =>
    ({
      id: `acme/${name}`,
      local: null,
      workspace: 'acme',
      remote: { name, owner: 'acme', url: origin.replace(/\.git$/, ''), sshUrl: 'unused' },
    }) as RepoStatus

  // By default: GitHub's own organization, mirrored on the disk.
  const mirrored = await cloneRepo(status, repo('demo'), null)
  assert.equal(mirrored.message, 'cloné dans acme/demo')
  assert.ok(fs.existsSync(path.join(fleet, 'acme', 'demo', 'README.md')))

  const elsewhere = await cloneRepo(status, repo('autre'), 'Sites/Vitrine')
  assert.equal(elsewhere.message, 'cloné dans Sites/Vitrine/autre')
  assert.equal((await cloneRepo(status, repo('racine'), '')).message, 'cloné dans racine')

  const refused = await cloneRepo(status, repo('dehors'), '../ailleurs')
  assert.equal(refused.outcome, 'failed')
  assert.ok(!fs.existsSync(path.join(root, 'ailleurs')))
})
