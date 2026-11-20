import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandAt, NPX_COMMAND } from './selfCommand'

test('names itself by what will still be there tomorrow', () => {
  assert.equal(commandAt('/home/me/Zeus/dist/cli.js'), 'node /home/me/Zeus/dist/cli.js')
  assert.equal(
    commandAt('/home/me/Mes projets/Zeus/dist/cli.js'),
    "node '/home/me/Mes projets/Zeus/dist/cli.js'",
  )
  assert.equal(
    commandAt('/home/me/Zeus/src/server/selfCommand.ts'),
    'pnpm --dir /home/me/Zeus --silent exec tsx src/cli.ts',
  )
  // Installed for good, the file stays where it is: its path is the shortest road back.
  assert.equal(
    commandAt('/usr/local/lib/node_modules/@vincweb/zeus/dist/cli.js'),
    'node /usr/local/lib/node_modules/@vincweb/zeus/dist/cli.js',
  )
})

test('names the package, and its registry, when npx fetched it into a cache', () => {
  const cached = '/home/me/.npm/_npx/0a1b2c3d/node_modules/@vincweb/zeus/dist/cli.js'
  assert.equal(commandAt(cached), NPX_COMMAND)
  assert.match(NPX_COMMAND, /--@vincweb:registry=https:\/\/registry\.npmjs\.org @vincweb\/zeus$/)
})
