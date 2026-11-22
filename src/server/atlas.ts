import fs from 'fs'
import path from 'path'
import type { AtlasScore } from '../shared/types'
import { asArray, asNumber, asRecord, asString, parseJson } from './json'
import { dependsOn } from './tools'

/** What says code-atlas is set up in a project: its config, its state, or the dependency. */
const CONFIG = 'code-atlas.json'
const STATE = '.code-atlas'
const PACKAGE = '@vincweb/code-atlas'

/**
 * code-atlas in one clone: null when nothing of it is there; otherwise the score it recorded, when
 * it recorded one.
 */
export const readAtlas = (dir: string): { score: AtlasScore | null } | null => {
  const score = readAtlasScore(dir)
  const there =
    score !== null ||
    fs.existsSync(path.join(dir, CONFIG)) ||
    fs.existsSync(path.join(dir, STATE)) ||
    dependsOn(dir, PACKAGE)
  return there ? { score } : null
}

/** Where code-atlas keeps what it was last asked to record, in a project. */
const BASELINE = path.join(STATE, 'baseline.json')

/** A baseline is under a kilobyte; past this, the file is not one. */
const MAX_BYTES = 256 * 1024

/**
 * The score code-atlas recorded for a project: its baseline, written when someone accepted the
 * state of the code (`--update-baseline`) — a reference, not a measure taken now. Zeus only reads
 * what the tool left there, and the file may come from anyone who commits to the repository: one
 * that is missing, too large or of another shape gives no score, and no warning.
 */
export const readAtlasScore = (dir: string): AtlasScore | null => {
  try {
    const file = path.join(dir, BASELINE)
    if (fs.statSync(file).size > MAX_BYTES) return null
    const baseline = asRecord(parseJson(fs.readFileSync(file, 'utf8')))
    const scores = asRecord(baseline?.scores)
    const overall = asNumber(scores?.overall)
    if (overall === null || !Number.isFinite(overall) || overall < 0 || overall > 100) return null
    const families = asArray(scores?.families).flatMap((item) => {
      const entry = asRecord(item)
      const family = asString(entry?.family)
      const score = asNumber(entry?.score)
      return family && score !== null && Number.isFinite(score)
        ? [{ family: family.slice(0, 40), score }]
        : []
    })
    return {
      overall: Math.round(overall),
      savedAt: asString(baseline?.savedAt),
      families: families.slice(0, 12),
    }
  } catch {
    return null
  }
}
