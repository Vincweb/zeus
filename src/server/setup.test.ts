import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import { ConfigError, isHome, loadHome } from './home'
import { createHome, describeTarget } from './setup'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-setup-'))

test('makes a folder a root with a .zeus/ and nothing else', () => {
  const dir = path.join(tmp(), 'Programmation')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine\n')
  createHome({ dir, hiddenOwners: [] })

  assert.ok(isHome(dir))
  assert.deepEqual(fs.readdirSync(dir).sort(), ['.zeus', 'notes.txt'])
  // With nothing to say, not even a config file.
  assert.deepEqual(fs.readdirSync(path.join(dir, '.zeus')), [])
  assert.deepEqual(loadHome(dir).config.hiddenOwners, [])
})

test('creates the folder when only its last segment is missing, and records accounts left out', () => {
  const dir = path.join(tmp(), 'projets')
  createHome({ dir, hiddenOwners: ['BigOrg'] })
  assert.deepEqual(loadHome(dir).config.hiddenOwners, ['bigorg'])
})

test('refuses what it should: twice, inside another root, a missing parent, a file, a bad login', () => {
  const root = tmp()
  const dir = path.join(root, 'a')
  createHome({ dir, hiddenOwners: [] })
  assert.throws(() => createHome({ dir, hiddenOwners: [] }), /déjà un dossier Zeus/)
  assert.throws(
    () => createHome({ dir: path.join(dir, 'sous', 'projet'), hiddenOwners: [] }),
    /déjà dans le dossier Zeus/,
  )
  assert.throws(
    () => createHome({ dir: path.join(root, 'deep', 'deeper'), hiddenOwners: [] }),
    /n'existe pas/,
  )
  fs.writeFileSync(path.join(root, 'file'), '')
  assert.throws(() => createHome({ dir: path.join(root, 'file'), hiddenOwners: [] }), /fichier/)
  assert.throws(
    () => createHome({ dir: path.join(root, 'b'), hiddenOwners: ['not a login'] }),
    ConfigError,
  )
  assert.ok(!fs.existsSync(path.join(root, 'deep')))
  assert.ok(!fs.existsSync(path.join(root, 'b')))
})

test('describes a folder that could become a root', () => {
  const root = tmp()
  fs.mkdirSync(path.join(root, 'App', '.git'), { recursive: true })
  fs.mkdirSync(path.join(root, 'Sites', 'Vitrine', '.git'), { recursive: true })
  const before = describeTarget(root)
  assert.deepEqual(
    [before.exists, before.isHome, before.insideHome, before.clones],
    [true, false, null, 2],
  )
  assert.equal(describeTarget(path.join(root, 'pas-encore')).exists, false)

  createHome({ dir: root, hiddenOwners: [] })
  assert.equal(describeTarget(root).isHome, true)
  assert.equal(describeTarget(path.join(root, 'Sites')).insideHome, root)
})
