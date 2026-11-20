import fs from 'fs'
import path from 'path'
import type { SetupTarget } from '../shared/types'
import { isDirectory } from './folders'
import { ConfigError, MARKER, expandTilde, findHome, isHome, saveHiddenOwners, tilde } from './home'
import { findRepos } from './local'

/** A folder named by hand, made absolute. Refused when there is nothing to resolve. */
export const resolveTarget = (asked: string) => {
  const trimmed = asked.trim()
  if (!trimmed) throw new ConfigError('indique le dossier parent de tes projets')
  return path.resolve(expandTilde(trimmed))
}

/** What stands today at a folder that could become a root. */
export const describeTarget = (dir: string): SetupTarget => {
  const exists = isDirectory(dir)
  // The nearest root above it — not itself — is what would make this folder part of a fleet.
  const above = findHome(path.dirname(dir))
  return {
    dir,
    label: tilde(dir),
    exists,
    isHome: isHome(dir),
    insideHome: above !== dir ? above : null,
    clones: exists ? findRepos(dir, 3).length : 0,
  }
}

/** GitHub's own rule for an account or organization name. */
const LOGIN = /^[a-z\d](?:[a-z\d-]{0,38})$/i

/**
 * Makes a folder a root: a `.zeus/` in it, and nothing else. No list of repositories, no path —
 * the accounts come from `gh`, the clones from a scan — so there is nothing here to keep up to
 * date. The only thing ever written is which accounts to leave out, when there are some.
 *
 * The folder itself is created when only its last segment is missing, never deeper, so a typo
 * cannot grow a tree of folders.
 */
export const createHome = ({ dir, hiddenOwners }: { dir: string; hiddenOwners: string[] }) => {
  const unknown = hiddenOwners.find((owner) => !LOGIN.test(owner))
  if (unknown !== undefined) throw new ConfigError(`nom de compte GitHub invalide : ${unknown}`)
  if (isHome(dir)) throw new ConfigError(`${tilde(dir)} est déjà un dossier Zeus`)
  const above = findHome(path.dirname(dir))
  if (above) {
    throw new ConfigError(
      `${tilde(dir)} est déjà dans le dossier Zeus ${tilde(above)} : ses projets y sont suivis`,
    )
  }
  if (fs.existsSync(dir)) {
    if (!isDirectory(dir)) throw new ConfigError(`${tilde(dir)} est un fichier, pas un dossier`)
  } else {
    const parent = path.dirname(dir)
    if (!isDirectory(parent)) {
      throw new ConfigError(`${tilde(parent)} n'existe pas : crée d'abord ce dossier`)
    }
    fs.mkdirSync(dir)
  }
  fs.mkdirSync(path.join(dir, MARKER))
  saveHiddenOwners(
    dir,
    hiddenOwners.map((owner) => owner.toLowerCase()),
  )
  return dir
}
