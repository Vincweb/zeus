import { Dashboard } from './components/Dashboard'
import { Setup } from './components/Setup'
import { Welcome } from './components/Welcome'
import { useRoute } from './router'

/**
 * Three screens: the welcome page that picks a parent folder, the set-up that makes one, and the
 * fleet the URL names.
 */
export const App = () => {
  const route = useRoute()
  // Keyed by root: another folder is another screen, not the same one with stale filters.
  if (route.view === 'fleet') {
    return <Dashboard key={route.root} root={route.root} workspace={route.workspace} />
  }
  if (route.view === 'setup') return <Setup key={route.dir} dir={route.dir} />
  return <Welcome />
}
