import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import type { ExecResult } from './exec'
import { createJournal, displayLine } from './journal'

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-journal-'))
const node = process.execPath

const until = async (check: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('trop long')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const ok: ExecResult = { ok: true, code: 0, stdout: '', stderr: '', timedOut: false }

test('keeps what a tool prints, line by line, and the page it announces', async () => {
  const journal = createJournal()
  const script = [
    "process.stdout.write('npm 10%\\rnpm 100%\\n')",
    "console.log('\\x1b[32mready\\x1b[0m on http://127.0.0.1:4800/')",
    "console.error('a warning')",
  ].join(';')
  const started = journal.start({
    title: 'outil',
    words: [node, '-e', script],
    cwd: folder(),
    where: 'Sites/App',
    toolId: 'outil',
  })
  const entry = () => journal.list().find((candidate) => candidate.id === started.id)
  await until(() => entry()?.state !== 'running')
  assert.equal(entry()?.state, 'ok')
  assert.equal(entry()?.url, 'http://127.0.0.1:4800/')
  const lines = journal.linesOf(started.id, 0)?.lines ?? []
  // A carriage return rewrites its line; colours are left out.
  assert.ok(lines.includes('npm 100%'))
  assert.ok(!lines.some((line) => line.includes('10%')))
  assert.ok(lines.includes('ready on http://127.0.0.1:4800/'))
  assert.ok(lines.includes('a warning'))
  assert.equal(lines.at(-1), '→ terminé (code 0)')
})

test(
  'stops a tool and what it started, and never starts the same one twice in one place',
  { skip: process.platform === 'win32' },
  async () => {
    const journal = createJournal()
    // The way `npx` works: the process that serves is a child of the one started.
    const script = [
      "const child = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])",
      'console.log(`child ${child.pid}`)',
      'setInterval(() => {}, 1000)',
    ].join(';')
    const cwd = folder()
    const run = () =>
      journal.start({ title: 'serveur', words: [node, '-e', script], cwd, where: '.', toolId: 's' })
    const started = run()
    assert.equal(run().id, started.id)
    await until(() =>
      (journal.linesOf(started.id, 0)?.lines ?? []).some((l) => l.startsWith('child')),
    )
    const pid = Number(
      journal
        .linesOf(started.id, 0)
        ?.lines.find((line) => line.startsWith('child'))
        ?.slice('child '.length),
    )
    assert.ok(alive(pid))
    assert.equal(journal.stop(started.id), true)
    await until(() => journal.list().find((entry) => entry.id === started.id)?.state === 'stopped')
    await until(() => !alive(pid))
    assert.equal(journal.stop(started.id), false)
  },
)

test('writes down the commands of an action, and only those', async () => {
  const journal = createJournal()
  // A read outside any action — a status — is not kept.
  journal.recordCommand('git', ['status'], ok)
  await journal.track(
    'Mise à jour de acme/app',
    'Sites/App',
    () => {
      journal.recordCommand(
        'git',
        ['-c', 'credential.https://github.com.helper=!gh auth git-credential', 'fetch', '--quiet'],
        { ...ok, stdout: 'Already up to date.\n' },
      )
      journal.recordCommand('git', ['merge', '--ff-only'], {
        ...ok,
        ok: false,
        code: 128,
        stderr: 'fatal: Not possible to fast-forward\n',
      })
      return Promise.resolve({ ok: false, message: 'avance rapide refusée' })
    },
    (result) => result,
  )
  const entries = journal.list()
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.state, 'failed')
  assert.equal(entries[0]?.command, 'git merge --ff-only')
  assert.deepEqual(journal.linesOf(entries[0]?.id ?? 0, 0)?.lines, [
    '$ git fetch --quiet',
    'Already up to date.',
    '$ git merge --ff-only',
    'fatal: Not possible to fast-forward',
    '  (code 128)',
    '→ avance rapide refusée',
  ])
})

test('keeps the last lines of a long output, numbered from the first ever written', async () => {
  const journal = createJournal()
  const stdout = Array.from({ length: 1500 }, (_, index) => `ligne ${index}`).join('\n')
  await journal.track(
    'Bavard',
    null,
    () => {
      journal.recordCommand('outil', [], { ...ok, stdout: `${stdout}\n${'x'.repeat(10_000)}` })
      return Promise.resolve({ ok: true, message: 'fini' })
    },
    (result) => result,
  )
  const [entry] = journal.list()
  const tail = journal.linesOf(entry?.id ?? 0, 0)
  assert.equal(tail?.total, 1503)
  assert.equal(tail?.lines.length, 1000)
  assert.equal(tail?.from, 503)
  assert.ok((tail?.lines.at(-2)?.length ?? 0) <= 2000)
  assert.deepEqual(journal.linesOf(entry?.id ?? 0, 1502)?.lines, ['→ fini'])
})

test('shows a git command without the configuration it was given', () => {
  assert.equal(
    displayLine('git', ['-c', 'credential.helper=x', 'clone', '--quiet', '--', 'u', 'd']),
    'git clone --quiet -- u d',
  )
  assert.equal(displayLine('npm', ['-c', 'x']), 'npm -c x')
})

test('keeps its own lines in one entry, which is a log and not a run', () => {
  const journal = createJournal()
  const quiet = console.log
  console.log = () => {}
  try {
    journal.log('zeus : page sur http://localhost:4901/')
    journal.log('une autre ligne')
  } finally {
    console.log = quiet
  }
  const [entry] = journal.list()
  assert.equal(entry?.kind, 'zeus')
  assert.equal(entry?.state, 'ok')
  assert.equal(journal.list().length, 1)
  assert.equal(entry?.lines, 2)
  assert.equal(entry?.url, null)
})

test(
  'stops the tools it started when its server is ended by a signal, as a restart does',
  { skip: process.platform === 'win32' },
  async () => {
    const journalModule = path.join(import.meta.dirname, 'journal.ts')
    const inner = [
      "const child = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])",
      "console.log('grandchild ' + child.pid)",
      'setInterval(() => {}, 1000)',
    ].join(';')
    const server = [
      `const { createJournal, stopWithProcess } = await import(${JSON.stringify(journalModule)})`,
      'const journal = createJournal()',
      'stopWithProcess(journal)',
      `const entry = journal.start({ title: 't', words: [process.execPath, '-e', ${JSON.stringify(inner)}], cwd: ${JSON.stringify(folder())}, where: '.', toolId: 't' })`,
      'const wait = setInterval(() => {',
      "  const line = journal.linesOf(entry.id, 0)?.lines.find((text) => text.startsWith('grandchild'))",
      '  if (line) { console.log(line); clearInterval(wait) }',
      '}, 20)',
      'setInterval(() => {}, 1000)',
    ].join('\n')
    const { spawn } = await import('child_process')
    const zeus = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', server], {
      // Where tsx can be found: the tool itself runs in a throwaway folder.
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let output = ''
    zeus.stdout.setEncoding('utf8').on('data', (text: string) => (output += text))
    await until(() => /grandchild \d+/.test(output))
    const pid = Number(/grandchild (\d+)/.exec(output)?.[1])
    assert.ok(alive(pid))
    const ended = new Promise((resolve) => zeus.on('exit', resolve))
    zeus.kill('SIGTERM')
    await ended
    await until(() => !alive(pid))
  },
)

test('closes what is over, one entry or all of them, never what runs nor its own lines', async () => {
  const journal = createJournal()
  const quiet = console.log
  console.log = () => {}
  try {
    journal.log('zeus : prêt')
  } finally {
    console.log = quiet
  }
  const fail = () => Promise.resolve({ ok: false, message: 'non' })
  await journal.track('Échec 1', null, fail, (result) => result)
  await journal.track('Échec 2', null, fail, (result) => result)
  const cwd = folder()
  const running = journal.start({
    title: 'serveur',
    words: [node, '-e', 'setInterval(() => {}, 1000)'],
    cwd,
    where: '.',
    toolId: 's',
  })
  const first = journal.list().find((entry) => entry.title === 'Échec 1')
  assert.equal(journal.dismiss(first?.id ?? 0), 1)
  assert.equal(journal.dismiss(running.id), 0)
  assert.equal(journal.dismiss('finished'), 1)
  assert.deepEqual(
    journal.list().map((entry) => entry.title),
    ['serveur', 'Serveur Zeus'],
  )
  journal.stop(running.id)
  await until(() => journal.list().find((entry) => entry.id === running.id)?.state === 'stopped')
})
