import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import {
  ConfigError,
  checkHome,
  discoverHomes,
  findHome,
  folderFor,
  followsRepo,
  loadHome,
  saveFollowedRepos,
  saveHiddenOwners,
  toolsOf,
} from './home'

/** A parent folder with its `.zeus/`, a project beneath it, and optionally a config. */
const homeWith = (config?: unknown) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-home-'))
  fs.mkdirSync(path.join(root, '.zeus'))
  fs.mkdirSync(path.join(root, 'Sites', 'Vitrine', 'src'), { recursive: true })
  if (config !== undefined) {
    fs.writeFileSync(path.join(root, '.zeus', 'config.json'), JSON.stringify(config))
  }
  return root
}

test('finds the root from any folder beneath it, and nothing outside one', () => {
  const root = homeWith()
  assert.equal(findHome(root), root)
  assert.equal(findHome(path.join(root, 'Sites', 'Vitrine', 'src')), root)
  assert.equal(findHome(fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-none-'))), null)
})

test('needs no config at all: an empty .zeus/ is a root with the defaults', () => {
  const home = loadHome(homeWith())
  assert.deepEqual(home.config.hiddenOwners, [])
  assert.equal(home.config.scanDepth, 3)
  assert.equal(folderFor(home, 'Vincweb'), 'Vincweb')
  assert.deepEqual(
    toolsOf(home).map((tool) => tool.id),
    ['claude-code', 'code-atlas', 'claude-context-viewer'],
  )
})

test('reads what a config adds: accounts left out, a folder renamed, tools on top', () => {
  const home = loadHome(
    homeWith({
      hiddenOwners: ['BigOrg'],
      folders: { Vincweb: 'perso' },
      tools: [
        {
          id: 'caudron-plugin',
          scope: 'claude-plugin',
          detect: { plugin: 'caudron-plugin@caudron' },
        },
        { id: 'code-atlas', name: 'mine', scope: 'repo' },
      ],
    }),
  )
  assert.deepEqual(home.config.hiddenOwners, ['bigorg'])
  assert.equal(folderFor(home, 'vincweb'), 'perso')
  assert.equal(folderFor(home, 'acme'), 'acme')
  // A tool with a default's id replaces it; the others are added.
  assert.deepEqual(
    toolsOf(home).map((tool) => [tool.id, tool.name]),
    [
      ['claude-code', 'Claude Code'],
      ['claude-context-viewer', 'claude-context-viewer'],
      ['caudron-plugin', 'caudron-plugin'],
      ['code-atlas', 'mine'],
    ],
  )
})

test('refuses a folder that is not a root, a broken config, a folder name that climbs', () => {
  assert.throws(() => loadHome(os.tmpdir()), /n'est pas un dossier Zeus/)
  const broken = homeWith()
  fs.writeFileSync(path.join(broken, '.zeus', 'config.json'), '{ not json')
  assert.throws(() => loadHome(broken), ConfigError)
  assert.throws(() => loadHome(homeWith({ folders: { Vincweb: '../ailleurs' } })), /nom de dossier/)
  assert.throws(() => loadHome(homeWith({ tools: [{ id: 'x' }] })), ConfigError)
})

test('writes the accounts left out, and no file when there is nothing to say', () => {
  const root = homeWith({ folders: { Vincweb: 'perso' } })
  const file = path.join(root, '.zeus', 'config.json')
  saveHiddenOwners(root, ['acme', 'acme'])
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    folders: { Vincweb: 'perso' },
    hiddenOwners: ['acme', 'acme'],
  })
  saveHiddenOwners(root, [])
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { folders: { Vincweb: 'perso' } })

  const bare = homeWith()
  saveHiddenOwners(bare, ['acme'])
  saveHiddenOwners(bare, [])
  assert.ok(!fs.existsSync(path.join(bare, '.zeus', 'config.json')))
})

test('offers the launch root, the roots right under here, and the ones the page remembers', () => {
  const launch = homeWith()
  const here = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-here-'))
  fs.mkdirSync(path.join(here, 'Projets', '.zeus'), { recursive: true })
  fs.mkdirSync(path.join(here, 'Autre'))
  const gone = path.join(here, 'Disparu')

  const candidates = discoverHomes(launch, here, [gone])
  const byName = new Map(candidates.map((candidate) => [candidate.name, candidate]))
  assert.deepEqual([...byName.keys()].sort(), ['Disparu', 'Projets', path.basename(launch)].sort())
  assert.equal(byName.get(path.basename(launch))?.isLaunch, true)
  assert.equal(byName.get('Projets')?.error, null)
  assert.match(byName.get('Disparu')?.error ?? '', /n'est pas un dossier Zeus/)
})

test('opens the root of a typed path, wherever beneath it the path points', () => {
  const root = homeWith()
  const deep = checkHome(`  ${path.join(root, 'Sites', 'Vitrine')}  `, null)
  assert.ok('candidate' in deep && deep.candidate.root === root)
  assert.ok('error' in checkHome('', null))
  assert.ok('error' in checkHome(path.join(root, 'nulle-part'), null))
  assert.ok('error' in checkHome(fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-none-')), null))
})

test('follows every repository of an account, unless the config names the ones it follows', () => {
  const home = loadHome(homeWith({ followedRepos: { Vol7: ['Advance'] } }))
  assert.deepEqual(home.config.followedRepos, { vol7: ['advance'] })
  assert.ok(followsRepo(home, 'vol7', 'advance'))
  assert.ok(followsRepo(home, 'VOL7', 'ADVANCE'))
  assert.ok(!followsRepo(home, 'vol7', 'billing'))
  // An account the config does not name is followed whole.
  assert.ok(followsRepo(home, 'Vincweb', 'anything'))
  assert.deepEqual(loadHome(homeWith()).config.followedRepos, {})
  assert.throws(
    () => loadHome(homeWith({ followedRepos: { vol7: ['../ailleurs'] } })),
    /n'est pas un nom de repo/,
  )
})

test('writes the repositories followed of an account, and nothing once all of them are', () => {
  const root = homeWith({ hiddenOwners: ['bigorg'] })
  const file = path.join(root, '.zeus', 'config.json')
  saveFollowedRepos(root, 'Vol7', ['web', 'advance', 'advance'])
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    hiddenOwners: ['bigorg'],
    followedRepos: { vol7: ['advance', 'web'] },
  })
  // The same account in another casing replaces its entry rather than adding one.
  saveFollowedRepos(root, 'vol7', ['advance'])
  saveFollowedRepos(root, 'acme', ['api'])
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    hiddenOwners: ['bigorg'],
    followedRepos: { vol7: ['advance'], acme: ['api'] },
  })
  saveFollowedRepos(root, 'VOL7', null)
  saveFollowedRepos(root, 'acme', null)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { hiddenOwners: ['bigorg'] })

  const bare = homeWith()
  saveFollowedRepos(bare, 'vol7', ['advance'])
  saveFollowedRepos(bare, 'vol7', null)
  assert.ok(!fs.existsSync(path.join(bare, '.zeus', 'config.json')))
})
