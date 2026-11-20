import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LocalRepo, RemoteRepo } from '../shared/types'
import { declaresZeus, sortClones, syncOf } from './status'

const clone = (relativePath: string, remoteUrl: string | null, githubId: string | null) =>
  ({ relativePath, path: `/root/${relativePath}`, remoteUrl, githubId }) as LocalRepo

const remotes = new Map(
  ['vincweb/agenda', 'vincweb/mes-notes', 'acme/api'].map((id) => [
    id,
    { fullName: id } as RemoteRepo,
  ]),
)
const followed = new Set(['vincweb', 'acme', 'slow-org'])
const readable = new Set(['vincweb', 'acme'])

test('matches a clone to its repository by its remote, whatever its folder is called', () => {
  const { clones, orphans } = sortClones(
    [
      clone('MesSitesWeb/MesNotes', 'git@github.com:Vincweb/mes-notes.git', 'vincweb/mes-notes'),
      clone('Agenda', 'git@github.com:Vincweb/Agenda.git', 'vincweb/agenda'),
      clone('acme/api', 'git@github.com:acme/api.git', 'acme/api'),
    ],
    remotes,
    followed,
    readable,
  )
  assert.deepEqual([...clones.keys()].sort(), ['acme/api', 'vincweb/agenda', 'vincweb/mes-notes'])
  assert.equal(clones.get('vincweb/mes-notes')?.relativePath, 'MesSitesWeb/MesNotes')
  assert.deepEqual(orphans, [])
})

test('says why every other git folder is not the clone of a followed repository', () => {
  const { clones, orphans } = sortClones(
    [
      clone('Autres/n8n', null, null),
      clone('Bac/clone', 'git@gitlab.com:x/y.git', null),
      clone('Lib/react', 'https://github.com/facebook/react.git', 'facebook/react'),
      clone('Autres/Brouillon', 'git@github.com:Vincweb/Brouillon.git', 'vincweb/brouillon'),
      clone('Agenda', 'git@github.com:Vincweb/Agenda.git', 'vincweb/agenda'),
      clone('Copies/Agenda-bis', 'git@github.com:Vincweb/Agenda.git', 'vincweb/agenda'),
      // An account in the fleet that GitHub did not answer for: nothing true to say yet.
      clone('slow/thing', 'git@github.com:slow-org/thing.git', 'slow-org/thing'),
    ],
    remotes,
    followed,
    readable,
  )
  assert.equal(clones.get('vincweb/agenda')?.relativePath, 'Agenda')
  assert.deepEqual(
    orphans.map(({ repo, reason }) => [repo.relativePath, reason]),
    [
      ['Autres/Brouillon', 'unknown-repo'],
      ['Autres/n8n', 'no-remote'],
      ['Bac/clone', 'not-github'],
      ['Copies/Agenda-bis', 'duplicate'],
      ['Lib/react', 'other-account'],
    ],
  )
})

test('judges "behind" on what GitHub holds before the counts of the last fetch', () => {
  const local = (ahead: number | null, behind: number | null) => ({ ahead, behind }) as LocalRepo
  assert.equal(syncOf(null, false), 'not-cloned')
  assert.equal(syncOf(local(0, 0), true), 'behind')
  assert.equal(syncOf(local(0, 0), false), 'up-to-date')
  assert.equal(syncOf(local(2, 0), false), 'ahead')
  assert.equal(syncOf(local(0, 3), false), 'behind')
  assert.equal(syncOf(local(1, 1), false), 'diverged')
  assert.equal(syncOf(local(null, null), false), 'no-upstream')
})

test('recognises a .mcp.json that declares the Zeus server', () => {
  const declares = (command: string, args: string[]) =>
    declaresZeus({ mcpServers: { anything: { command, args } } })
  assert.ok(declares('npx', ['-y', '@vincweb/zeus', 'mcp']))
  assert.ok(declares('node', ['Zeus/dist/cli.js', 'mcp']))
  assert.ok(!declares('npx', ['-y', '@vincweb/code-atlas', 'mcp']))
  assert.ok(!declares('node', ['Zeus/dist/cli.js', 'status']))
  assert.ok(!declaresZeus({}))
  assert.ok(!declaresZeus(undefined))
})
