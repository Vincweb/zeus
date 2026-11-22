import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test } from 'node:test'
import { readAtlas, readAtlasScore } from './atlas'

/** A clone with a `.code-atlas/baseline.json` holding `content`. */
const clone = (content?: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-atlas-'))
  if (content !== undefined) {
    fs.mkdirSync(path.join(dir, '.code-atlas'))
    fs.writeFileSync(path.join(dir, '.code-atlas', 'baseline.json'), content)
  }
  return dir
}

test('reads the score code-atlas recorded, with its date and its families', () => {
  const baseline = {
    commit: 'abc',
    savedAt: '2026-10-04T02:29:54.400Z',
    scores: {
      overall: 98.6,
      families: [
        { family: 'architecture', score: 100, rules: 4 },
        { family: 'clean-code', score: 97 },
        { family: 42, score: 'x' },
      ],
    },
    violations: {},
  }
  assert.deepEqual(readAtlasScore(clone(JSON.stringify(baseline))), {
    overall: 99,
    savedAt: '2026-10-04T02:29:54.400Z',
    families: [
      { family: 'architecture', score: 100 },
      { family: 'clean-code', score: 97 },
    ],
  })
})

test('gives no score for a file that is missing, broken, too large or of another shape', () => {
  assert.equal(readAtlasScore(clone()), null)
  assert.equal(readAtlasScore(clone('{ pas du json')), null)
  assert.equal(readAtlasScore(clone(JSON.stringify({ scores: { overall: '99' } }))), null)
  assert.equal(readAtlasScore(clone(JSON.stringify({ scores: { overall: 140 } }))), null)
  assert.equal(
    readAtlasScore(clone(JSON.stringify({ scores: { overall: 80 }, pad: 'x'.repeat(300_000) }))),
    null,
  )
})

test('finds code-atlas in a clone by its config, its state or the dependency, with no score yet', () => {
  const configured = clone()
  fs.writeFileSync(path.join(configured, 'code-atlas.json'), '{}')
  assert.deepEqual(readAtlas(configured), { score: null })
  const depends = clone()
  fs.writeFileSync(
    path.join(depends, 'package.json'),
    JSON.stringify({ devDependencies: { '@vincweb/code-atlas': '^1.0.0' } }),
  )
  assert.deepEqual(readAtlas(depends), { score: null })
  assert.equal(readAtlas(clone()), null)
  assert.equal(readAtlas(clone(JSON.stringify({ scores: { overall: 80 } })))?.score?.overall, 80)
})
