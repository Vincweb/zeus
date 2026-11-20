import { useSyncExternalStore } from 'react'
import { FLEET_PATH, SETUP_PATH } from '../shared/routes'

export type Route =
  | { view: 'welcome' }
  /** One root, and the account its repositories are narrowed to — null for all of them. */
  | { view: 'fleet'; root: string; workspace: string | null }
  /** The folder being set up; empty until one is typed. */
  | { view: 'setup'; dir: string }

const parse = (): Route => {
  const url = new URL(window.location.href)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  if (pathname === SETUP_PATH) return { view: 'setup', dir: url.searchParams.get('dir') ?? '' }
  const root = url.searchParams.get('root') ?? ''
  // A fleet URL without its root has nothing to show: that is the welcome page.
  return pathname === FLEET_PATH && root !== ''
    ? { view: 'fleet', root, workspace: url.searchParams.get('workspace') }
    : { view: 'welcome' }
}

/**
 * One snapshot for the whole page, kept at module level: a hook holding state of its own would
 * give every component a private copy of the URL, and they would drift apart on the first click.
 */
let route = parse()
const listeners = new Set<() => void>()

const publish = () => {
  route = parse()
  for (const listener of listeners) listener()
}

// The back and forward buttons change the URL without asking us.
window.addEventListener('popstate', publish)

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useRoute = () => useSyncExternalStore(subscribe, () => route)

/**
 * `replace` for a change that is not a place to come back to — switching account inside a fleet —
 * so the back button leaves the fleet instead of replaying every tab that was clicked.
 */
export const navigate = (to: string, { replace = false }: { replace?: boolean } = {}) => {
  if (replace) window.history.replaceState(null, '', to)
  else {
    window.history.pushState(null, '', to)
    window.scrollTo({ top: 0 })
  }
  publish()
}
