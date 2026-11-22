import assert from 'node:assert/strict'
import { test } from 'node:test'
import { atlasProjectUrl } from './routes'

test('links a clone to its page in a running code-atlas', () => {
  assert.equal(
    atlasProjectUrl('http://127.0.0.1:4800', '/Users/me/dev/acme/web'),
    'http://127.0.0.1:4800/project?root=/Users/me/dev/acme/web',
  )
})

test('keeps only the origin of what code-atlas announced', () => {
  assert.equal(
    atlasProjectUrl('http://localhost:4810/project?root=/Users/me/dev', '/Users/me/dev/acme/api'),
    'http://localhost:4810/project?root=/Users/me/dev/acme/api',
  )
})

test('escapes what would end the query in a folder name', () => {
  const url = atlasProjectUrl('http://127.0.0.1:4800/', '/Users/me/my dev/a&b#c')
  assert.equal(url, 'http://127.0.0.1:4800/project?root=/Users/me/my%20dev/a%26b%23c')
  assert.equal(new URL(url ?? '').searchParams.get('root'), '/Users/me/my dev/a&b#c')
})

test('gives nothing for an announce that is not an address', () => {
  assert.equal(atlasProjectUrl('127.0.0.1:4800', '/Users/me/dev/acme/web'), null)
})
