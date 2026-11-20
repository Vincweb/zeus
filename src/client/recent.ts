import { useSyncExternalStore } from 'react'

/** A root this browser has opened, as it looked the last time. */
export type RecentHome = { root: string; name: string; accounts: string[]; openedAt: string }

const KEY = 'zeus.recent-homes'
const MAX = 8

const isRecent = (value: unknown): value is RecentHome => {
  if (typeof value !== 'object' || value === null) return false
  const { root, name, accounts, openedAt } = value as Record<string, unknown>
  return (
    typeof root === 'string' &&
    typeof name === 'string' &&
    typeof openedAt === 'string' &&
    Array.isArray(accounts) &&
    accounts.every((account) => typeof account === 'string')
  )
}

/**
 * The list lives in this browser only — a convenience, never a registry. Storage can be refused
 * (a private window, a full quota): the page then simply remembers nothing.
 */
const read = (): RecentHome[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX) : []
  } catch {
    return []
  }
}

let recents = read()
const listeners = new Set<() => void>()

const write = (next: RecentHome[]) => {
  recents = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Kept for this visit, at least.
  }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useRecentHomes = () => useSyncExternalStore(subscribe, () => recents)

export const rememberHome = (home: Omit<RecentHome, 'openedAt'>) =>
  write(
    [
      { ...home, openedAt: new Date().toISOString() },
      ...recents.filter((recent) => recent.root !== home.root),
    ].slice(0, MAX),
  )

export const forgetHome = (root: string) => write(recents.filter((recent) => recent.root !== root))
