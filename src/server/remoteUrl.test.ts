import assert from 'node:assert/strict'
import { test } from 'node:test'
import { githubIdOf } from './remoteUrl'

test('reads owner/name from the remote forms git writes', () => {
  assert.equal(githubIdOf('git@github.com:Vincweb/AppWeb.git'), 'vincweb/appweb')
  assert.equal(
    githubIdOf('https://github.com/Vincweb/kyutai-tts-mcp.git'),
    'vincweb/kyutai-tts-mcp',
  )
  assert.equal(githubIdOf('https://github.com/Vincweb/mes-notes'), 'vincweb/mes-notes')
  assert.equal(githubIdOf('ssh://git@github.com/Vincweb/zeus.git'), 'vincweb/zeus')
  assert.equal(githubIdOf('https://token@github.com/Vincweb/zeus.git/'), 'vincweb/zeus')
})

test('keeps a dot inside the repository name', () => {
  assert.equal(githubIdOf('git@github.com:Vincweb/next.js.git'), 'vincweb/next.js')
})

test('gives null for anything that is not a GitHub repository', () => {
  assert.equal(githubIdOf(null), null)
  assert.equal(githubIdOf(''), null)
  assert.equal(githubIdOf('git@gitlab.com:someone/thing.git'), null)
  assert.equal(githubIdOf('/tmp/bare.git'), null)
  assert.equal(githubIdOf('https://github.com/Vincweb'), null)
})
