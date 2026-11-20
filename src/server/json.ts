/** Narrowing helpers for JSON read from a file or another program, where nothing is promised. */

export type Json = Record<string, unknown>

export const asRecord = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null

export const asString = (value: unknown) => (typeof value === 'string' ? value : null)

export const asNumber = (value: unknown) => (typeof value === 'number' ? value : null)

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Walks down a chain of keys, giving undefined as soon as a step is not an object. */
export const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => asRecord(current)?.[key], value)

export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
