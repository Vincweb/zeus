import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogEntry, isNewer } from './versions'

test('says a release is newer only when it comes later, not when it merely differs', () => {
  assert.ok(isNewer('1.5.0', '1.4.0'))
  assert.ok(isNewer('1.10.0', '1.9.3'))
  assert.ok(isNewer('2.0.0', '1.99.99'))
  assert.ok(isNewer('v0.9.1', '0.9.0'))
  assert.ok(!isNewer('1.4.0', '1.4.0'))
  assert.ok(!isNewer('1.3.9', '1.4.0'))
  // A pre-release leads to its release, and pre-releases follow each other.
  assert.ok(isNewer('1.4.0', '1.4.0-beta.2'))
  assert.ok(!isNewer('1.4.0-beta.2', '1.4.0'))
  assert.ok(isNewer('1.4.0-beta.10', '1.4.0-beta.2'))
  // What is not a version tells nothing.
  assert.ok(!isNewer('latest', '1.4.0'))
  assert.ok(!isNewer('1.5.0', 'installé'))
})

test('reads a plugin’s version off its marketplace catalog, and only a plain folder besides', () => {
  const catalog = {
    plugins: [
      { name: 'listed', version: '1.4.0', source: './' },
      { name: 'here', source: './' },
      { name: 'nested', source: './plugins/nested' },
      { name: 'climbing', source: './../elsewhere' },
      { name: 'remote', source: { source: 'github', repo: 'a/b' } },
      { name: 'odd', source: './a b' },
    ],
  }
  assert.deepEqual(catalogEntry(catalog, 'listed'), { version: '1.4.0' })
  assert.deepEqual(catalogEntry(catalog, 'here'), { manifest: '.claude-plugin/plugin.json' })
  assert.deepEqual(catalogEntry(catalog, 'nested'), {
    manifest: 'plugins/nested/.claude-plugin/plugin.json',
  })
  for (const name of ['climbing', 'remote', 'odd', 'absent']) {
    assert.equal(catalogEntry(catalog, name), null, name)
  }
  assert.equal(catalogEntry(undefined, 'listed'), null)
})
