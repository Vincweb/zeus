#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ActionResult, RepoStatus } from './shared/types'
import { cloneRepo, updateRepo } from './server/actions'
import { mapLimit } from './server/exec'
import { ConfigError, MARKER, expandTilde, findHome, loadHome, tilde } from './server/home'
import { serveMcp } from './server/mcp'
import { renderStatus } from './server/report'
import { serveZeus } from './server/server'
import { createHome } from './server/setup'
import { collectStatus } from './server/status'

const DEFAULT_PORT = 4900
const DEFAULT_HOST = '127.0.0.1'

const USAGE = `zeus — suivre et piloter une flotte de repos git

Usage
  zeus [options]                    ouvre la page : sur ta flotte, sinon sur l'accueil
  zeus init [dossier]               fait d'un dossier le dossier parent de tes projets
  zeus status [--json]              l'état de chaque repo suivi
  zeus clone <repo> [--into <d>]    clone un repo suivi, dans le dossier de son compte
  zeus update <repo>... | --all     fetch, puis avance rapide là où rien ne s'y oppose
  zeus mcp                          sert la flotte à un agent (Model Context Protocol, sur stdio)

Options
  -r, --root <dir>       le dossier parent (défaut : celui qui contient ${MARKER}/, en remontant
                         depuis le dossier courant ; ou ZEUS_ROOT)
      --workspace <nom>  avec status : un seul compte GitHub
  -p, --port <n>         port de la page (défaut : ${DEFAULT_PORT}, ou le suivant libre)
      --host <host>      interface d'écoute (défaut : ${DEFAULT_HOST})
      --no-open          ne pas ouvrir le navigateur
      --json             avec status : le document complet, pour un script ou un agent
      --full             avec status : attendre aussi la CI et les PR des repos non clonés
                         d'une grosse organisation (plus lent)
      --into <dossier>   avec clone : un autre dossier sous le dossier parent
  -h, --help             cette aide
  -v, --version          la version

Zeus ne demande qu'un dossier parent. Tes comptes viennent de « gh », tes repos de GitHub, tes
clones d'un scan : un workspace, c'est un compte GitHub, et rien n'est à classer à la main.
Zeus ne garde aucun jeton, et ne met un clone à jour que par avance rapide — jamais de merge.
`

const readVersion = () => {
  const manifest = fileURLToPath(new URL('../package.json', import.meta.url))
  const raw: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  return raw && typeof raw === 'object' && 'version' in raw && typeof raw.version === 'string'
    ? raw.version
    : '0.0.0'
}

/** Flags that take a value, so the word after them is never read as a command or a repository. */
const VALUED = ['-r', '--root', '--workspace', '-p', '--port', '--host', '--into']

const valueOf = (argv: string[], ...names: string[]) => {
  for (const name of names) {
    const index = argv.indexOf(name)
    if (index !== -1) return argv[index + 1]
  }
  return undefined
}

const has = (argv: string[], ...names: string[]) => names.some((name) => argv.includes(name))

const positionals = (argv: string[]) =>
  argv.filter((arg, index) => !arg.startsWith('-') && !VALUED.includes(argv[index - 1] ?? ''))

/** A repository by `owner/name`, or by its bare name when only one followed repo carries it. */
const findRepo = (repos: RepoStatus[], wanted: string) => {
  const key = wanted.toLowerCase()
  const matches = repos.filter(
    (repo) => repo.id.toLowerCase() === key || repo.remote.name.toLowerCase() === key,
  )
  return matches.length === 1 ? (matches[0] ?? null) : null
}

const print = ({ id, ok, message }: ActionResult) =>
  console.log(`${ok ? '✓' : '✗'} ${id} — ${message}`)

const main = async (argv: string[]): Promise<number | null> => {
  if (has(argv, '-h', '--help')) {
    console.log(USAGE)
    return 0
  }
  const version = readVersion()
  if (has(argv, '-v', '--version')) {
    console.log(version)
    return 0
  }

  const [command, ...names] = positionals(argv)

  if (command === 'init') {
    const dir = path.resolve(expandTilde(names[0] ?? '.'))
    createHome({ dir, hiddenOwners: [] })
    console.log(`✓ ${tilde(dir)} est maintenant le dossier parent de tes projets (${MARKER}/ créé)`)
    return 0
  }

  // A root named by hand is that folder or nothing; otherwise the nearest one above here.
  const named = valueOf(argv, '-r', '--root') ?? process.env.ZEUS_ROOT
  const root = named ? path.resolve(expandTilde(named)) : findHome(process.cwd())

  if (command === undefined || command === 'serve') {
    // Read once before binding, so a broken config fails here rather than on the first request.
    if (root) loadHome(root)
    const port = Number(valueOf(argv, '-p', '--port') ?? DEFAULT_PORT)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`✗ port invalide : ${valueOf(argv, '-p', '--port')}`)
      return 1
    }
    serveZeus({
      launchRoot: root,
      port,
      host: valueOf(argv, '--host') ?? DEFAULT_HOST,
      version,
      open: !has(argv, '--no-open'),
      // A port asked for is that port or nothing; the default may step past a busy one.
      fallback: valueOf(argv, '-p', '--port') === undefined,
    })
    return null
  }

  if (command === 'mcp') {
    // Started even outside a root: the tools then say what is missing, which a client that only
    // sees a dead server could not.
    serveMcp({ root, cwd: process.cwd(), version })
    return null
  }

  if (!root) {
    console.error(
      `✗ aucun ${MARKER}/ ici ni au-dessus — lance « zeus init » dans le dossier parent de tes projets, ou passe --root <dossier>`,
    )
    return 1
  }
  const status = await collectStatus(loadHome(root), version, { complete: has(argv, '--full') })

  if (command === 'status') {
    console.log(
      has(argv, '--json')
        ? JSON.stringify(status, null, 2)
        : renderStatus(status, valueOf(argv, '--workspace') ?? null),
    )
    return 0
  }

  if (command === 'clone') {
    const repo = names[0] ? findRepo(status.repos, names[0]) : null
    if (!repo) {
      console.error(`✗ repo suivi introuvable ou ambigu : ${names[0] ?? '(aucun nom)'}`)
      return 1
    }
    const result = await cloneRepo(status, repo, valueOf(argv, '--into') ?? null)
    print(result)
    return result.ok ? 0 : 1
  }

  if (command === 'update') {
    const targets = has(argv, '--all')
      ? status.repos.filter((repo) => repo.local)
      : names.map((name) => findRepo(status.repos, name))
    if (targets.length === 0 || targets.includes(null)) {
      console.error('✗ nomme des repos suivis, ou passe --all')
      return 1
    }
    const results = await mapLimit(targets as RepoStatus[], 4, updateRepo)
    results.forEach(print)
    return results.every((result) => result.ok) ? 0 : 1
  }

  console.error(`✗ commande inconnue : ${command}\n\n${USAGE}`)
  return 1
}

// The exit code is set, never forced: `process.exit` would cut a large status short when stdout
// is a pipe — which is exactly how a script or an agent reads it.
main(process.argv.slice(2)).then(
  (code) => {
    if (code !== null) process.exitCode = code
  },
  (error: unknown) => {
    if (error instanceof ConfigError) console.error(`✗ ${error.message}`)
    else console.error(error)
    process.exitCode = 1
  },
)
