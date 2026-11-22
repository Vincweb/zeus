import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import type { LocalRepo, RemoteRepo, RepoStatus, StatusPayload } from '../../shared/types'
import { fleetView, homeView, notReadyBecause, repoView } from './calls'
import { PROTOCOL_VERSION, handleMessage } from './index'

// Started outside any root: the handshake and the catalogue still answer.
const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-mcp-'))
const ctx = { root: null, cwd: nowhere, version: '9.9.9' }

const resultOf = (response: unknown) => (response as { result: Record<string, unknown> }).result
const errorOf = (response: unknown) =>
  (response as { error: { code: number; message: string } }).error

test('answers the handshake with its name and the version the client speaks', async () => {
  const result = resultOf(
    await handleMessage(ctx, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    }),
  )
  assert.equal(result.protocolVersion, '2025-03-26')
  assert.deepEqual(result.serverInfo, { name: 'zeus', version: '9.9.9' })
  assert.match(String(result.instructions), /fleet/)

  const bare = resultOf(await handleMessage(ctx, { jsonrpc: '2.0', id: 2, method: 'initialize' }))
  assert.equal(bare.protocolVersion, PROTOCOL_VERSION)
})

test('lists its tools, each with a schema, the writing ones marked as such', async () => {
  const { tools } = resultOf(
    await handleMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  ) as {
    tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[]
  }
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['fleet', 'repo', 'home', 'update', 'clone', 'install'],
  )
  assert.ok(tools.every((tool) => tool.inputSchema.type === 'object'))
  assert.deepEqual(
    tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name),
    ['update', 'clone', 'install'],
  )
})

test('stays silent on a notification, and refuses what it does not know', async () => {
  assert.equal(
    await handleMessage(ctx, { jsonrpc: '2.0', method: 'notifications/initialized' }),
    null,
  )
  assert.equal(
    errorOf(await handleMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'nope' })).code,
    -32601,
  )
  assert.equal(errorOf(await handleMessage(ctx, [])).code, -32600)
  assert.equal(
    errorOf(
      await handleMessage(ctx, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'rm' },
      }),
    ).code,
    -32602,
  )
  assert.deepEqual(
    resultOf(await handleMessage(ctx, { jsonrpc: '2.0', id: 3, method: 'ping' })),
    {},
  )
})

test('says what is missing when there is no root here or above', async () => {
  const result = resultOf(
    await handleMessage(ctx, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'fleet', arguments: {} },
    }),
  ) as { isError: boolean; content: { text: string }[] }
  assert.equal(result.isError, true)
  assert.match(result.content[0]?.text ?? '', /No Zeus root/)
})

const remote = (name: string, extra: Partial<RemoteRepo> = {}): RemoteRepo => ({
  fullName: `Vincweb/${name}`,
  owner: 'Vincweb',
  name,
  description: `${name} description`,
  url: `https://github.com/Vincweb/${name}`,
  sshUrl: `git@github.com:Vincweb/${name}.git`,
  isPrivate: true,
  isArchived: false,
  isFork: false,
  language: 'TypeScript',
  pushedAt: null,
  defaultBranch: 'main',
  headOid: null,
  headCommittedAt: null,
  ci: 'none',
  openPullRequests: 0,
  openIssues: 0,
  detailed: true,
  ...extra,
})

const clone = (name: string, extra: Partial<LocalRepo> = {}): LocalRepo => ({
  path: `/fleet/${name}`,
  relativePath: name,
  remoteUrl: `git@github.com:Vincweb/${name}.git`,
  githubId: `vincweb/${name}`,
  branch: 'main',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  dirtyFiles: 0,
  modifiedFiles: 0,
  headOid: 'abc',
  lastCommitAt: null,
  hasClaudeMd: true,
  hasCi: false,
  ...extra,
})

const repo = (name: string, extra: Partial<RepoStatus> = {}): RepoStatus => ({
  id: `Vincweb/${name}`,
  remote: remote(name),
  local: clone(name),
  sync: 'up-to-date',
  remoteHasNew: false,
  workspace: 'Vincweb',
  group: null,
  ...extra,
})

const status = (repos: RepoStatus[]): StatusPayload => ({
  generatedAt: '2026-11-14T00:00:00Z',
  home: {
    root: '/fleet',
    label: '/fleet',
    name: 'fleet',
    login: 'Vincweb',
    folders: [''],
    cloneProtocol: 'ssh',
    statusCommand: 'zeus status --json',
    claude: { connected: false, connectCommand: 'claude mcp add zeus' },
    version: '9.9.9',
  },
  workspaces: [
    {
      login: 'Vincweb',
      kind: 'user',
      label: 'Perso',
      folder: 'Vincweb',
      hidden: false,
      repoNames: [],
      followedRepos: null,
    },
    {
      login: 'acme',
      kind: 'org',
      label: 'acme',
      folder: 'acme',
      hidden: false,
      // A large organization of which this root follows one repository.
      repoNames: ['api', 'billing', 'web'],
      followedRepos: ['api'],
    },
    {
      login: 'BigOrg',
      kind: 'org',
      label: 'BigOrg',
      folder: 'BigOrg',
      hidden: true,
      repoNames: [],
      followedRepos: null,
    },
  ],
  repos,
  orphans: [
    {
      repo: clone('stray', { remoteUrl: null, githubId: null, dirtyFiles: 2 }),
      reason: 'no-remote',
    },
  ],
  tools: [
    {
      id: 'code-atlas',
      name: 'code-atlas',
      description: '',
      scope: 'repo',
      installed: true,
      version: null,
      repos: ['Vincweb/clean'],
      installCommands: [],
      installable: [],
    },
  ],
  archived: ['old-site', 'vieux-blog'].map((name) => ({
    id: `Vincweb/${name}`,
    workspace: 'Vincweb',
    name,
    description: '',
    url: `https://github.com/Vincweb/${name}`,
    language: null,
    isPrivate: false,
    pushedAt: null,
  })),
  pendingDetails: 0,
  warnings: [],
})

const fleet = status([
  repo('clean', { group: 'Sites' }),
  repo('late', { sync: 'behind', remoteHasNew: true }),
  repo('busy', { local: clone('busy', { dirtyFiles: 4, ahead: 1 }), sync: 'ahead' }),
  repo('absent', { local: null, sync: 'not-cloned' }),
  repo('red', { remote: remote('red', { ci: 'failure' }) }),
  repo('api', { id: 'acme/api', workspace: 'acme', local: null, sync: 'not-cloned' }),
])

test('says why a clone is not ready to be worked in', () => {
  const [clean, late, busy, absent] = fleet.repos as [
    RepoStatus,
    RepoStatus,
    RepoStatus,
    RepoStatus,
  ]
  assert.deepEqual(notReadyBecause(clean), [])
  assert.match(notReadyBecause(late).join(), /update it first/)
  assert.deepEqual(notReadyBecause(busy), ['4 uncommitted files'])
  assert.deepEqual(notReadyBecause(absent), ['not cloned on this machine'])
  assert.deepEqual(notReadyBecause(repo('adrift', { local: clone('adrift', { branch: null }) })), [
    'HEAD is detached',
  ])
})

test('counts the scope it is given and narrows what it lists', () => {
  const all = fleetView(fleet, fleet.repos, {})
  assert.deepEqual(all.counts, {
    followed: 6,
    cloned: 4,
    toClone: 2,
    behind: 1,
    withUncommittedFiles: 1,
    withUnpushedCommits: 1,
    ciFailing: 1,
    ciNotRead: 0,
  })
  assert.deepEqual(all.workspaces, ['Vincweb', 'acme'])
  assert.equal(all.repos[0]?.path, '/fleet/clean')
  assert.equal(all.repos[0]?.workspace, 'Vincweb')

  const ids = (view: ReturnType<typeof fleetView>) =>
    view.repos.map((line) => line.id.split('/')[1])
  assert.deepEqual(ids(fleetView(fleet, fleet.repos, { filter: 'attention' })), [
    'late',
    'busy',
    'red',
  ])
  assert.deepEqual(ids(fleetView(fleet, fleet.repos, { filter: 'to-clone' })), ['absent', 'api'])
  assert.deepEqual(ids(fleetView(fleet, fleet.repos, { search: 'busy description' })), ['busy'])

  // One workspace: the counts are about it alone.
  const acme = fleetView(
    fleet,
    fleet.repos.filter((line) => line.workspace === 'acme'),
    {},
  )
  assert.equal(acme.counts.followed, 1)
  assert.deepEqual(ids(acme), ['api'])
})

test('gives one repository in full, and the parent folder with its accounts', () => {
  const clean = repoView(fleet, fleet.repos[0] as RepoStatus)
  assert.equal(clean.ready, true)
  assert.equal(clean.workspace, 'Vincweb')
  assert.equal(clean.clone?.path, '/fleet/clean')
  assert.deepEqual(clean.tools, ['code-atlas'])
  const late = repoView(fleet, fleet.repos[1] as RepoStatus)
  assert.equal(late.ready, false)
  assert.equal(late.notReadyBecause?.length, 1)
  assert.equal(repoView(fleet, fleet.repos[3] as RepoStatus).clone, null)

  const home = homeView(fleet)
  assert.equal(home.signedInAs, 'Vincweb')
  assert.deepEqual(
    home.workspaces.map((workspace) => [
      workspace.login,
      workspace.followed,
      workspace.repositories,
      workspace.repositoriesLeftOut,
      workspace.archived,
    ]),
    [
      ['Vincweb', true, 5, 0, ['old-site', 'vieux-blog']],
      ['acme', true, 1, 2, []],
      ['BigOrg', false, null, null, null],
    ],
  )
  assert.equal(home.archivedNotListed, 2)
  assert.equal(home.workspaces[1]?.newClonesGoTo, '/fleet/acme')
  assert.deepEqual(home.otherGitFolders, [
    { path: '/fleet/stray', reason: 'no-remote', uncommittedFiles: 2 },
  ])
})
