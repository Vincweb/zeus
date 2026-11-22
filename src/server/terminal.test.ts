import assert from 'node:assert/strict'
import { test } from 'node:test'
import { terminalArgs, terminalFailure } from './terminal'

test('hands the folder and the words to Terminal as arguments, never inside the script', () => {
  const dir = "/Users/ada/Projets/l'atelier $(rm -rf ~)"
  const args = terminalArgs(dir, ['npx', '@vincweb/code-atlas'])
  const cut = args.indexOf('--')
  assert.deepEqual(args.slice(cut + 1), [dir, 'npx', '@vincweb/code-atlas'])
  const script = args.slice(0, cut)
  assert.ok(script.every((part, index) => (index % 2 === 0 ? part === '-e' : true)))
  assert.ok(!script.some((part) => part.includes('atelier') || part.includes('code-atlas')))
  assert.ok(script.some((part) => part.includes('quoted form of')))
})

test('says where to allow Zeus when macOS refuses to let it drive Terminal', () => {
  const refused = {
    ok: false,
    code: 1,
    stdout: '',
    stderr: 'execution error: Not authorized to send Apple events to Terminal. (-1743)',
    timedOut: false,
  }
  assert.match(terminalFailure(refused), /Automatisation/)
  assert.match(terminalFailure({ ...refused, stderr: 'boom' }), /boom/)
})
