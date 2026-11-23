import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NPX_COMMAND } from './selfCommand'
import { catalogEntry, isNewer, upgradeAt } from './versions'

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

test('says how to get the latest Zeus only where it knows how it was installed', () => {
  const globalRoot = '/usr/local/lib/node_modules'
  // Fetched by npx: the same command, asked for the latest whatever the npm.
  assert.deepEqual(
    upgradeAt('/home/me/.npm/_npx/0a1b2c3d/node_modules/@vincweb/zeus/dist/cli.js', globalRoot),
    { via: 'npx', command: `${NPX_COMMAND}@latest` },
  )
  // Installed by npm for the whole machine: the install of any machine tool, from npmjs.
  assert.deepEqual(upgradeAt(`${globalRoot}/@vincweb/zeus/dist/cli.js`, globalRoot), {
    via: 'npm',
    command: 'npm install -g @vincweb/zeus@latest --@vincweb:registry=https://registry.npmjs.org/',
  })
  // A build or the sources of a clone are updated with that clone, never by npm.
  assert.equal(upgradeAt('/home/me/Zeus/dist/cli.js', globalRoot), null)
  assert.equal(upgradeAt('/home/me/Zeus/src/server/selfCommand.ts', globalRoot), null)
  // Another package of the global root, or no root known: nothing to say.
  assert.equal(upgradeAt(`${globalRoot}/@vincweb/zeus-other/dist/cli.js`, globalRoot), null)
  assert.equal(upgradeAt(`${globalRoot}/@vincweb/zeus/dist/cli.js`, null), null)
})
