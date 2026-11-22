import http from 'http'
import path from 'path'
import type { ActionResult, HomesPayload, Owner, StatusPayload } from '../shared/types'
import { claudeLink, fleetPath } from '../shared/routes'
import { cloneRepo, updateRepo } from './actions'
import { openInBrowser, openUrl, pageUrl } from './browser'
import { listOwnerRepos } from './github'
import {
  ConfigError,
  checkHome,
  discoverHomes,
  loadHome,
  saveFollowedRepos,
  saveHiddenOwners,
  toolsOf,
} from './home'
import { isAllowedHost, isForeign, mayAct } from './host'
import { installTool } from './install'
import { asArray, asRecord, asString, parseJson, type Json } from './json'
import { checkMachine, listOwners } from './machine'
import { createHome, describeTarget, resolveTarget } from './setup'
import { MISSING_CLIENT, clientIsBuilt, devPage, serveClientFile } from './static'
import { collectDetails, collectStatus } from './status'

const json = (response: http.ServerResponse, payload: unknown, status = 200) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

/** Room for a prompt handed to Claude; every other request body is a few names. */
const MAX_BODY = 64 * 1024

const readBody = (request: http.IncomingMessage) =>
  new Promise<unknown>((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY) chunks.push(chunk)
    })
    request.on('end', () => {
      resolve(size > MAX_BODY ? undefined : parseJson(Buffer.concat(chunks).toString('utf8')))
    })
    request.on('error', () => resolve(undefined))
  })

/** How long GitHub's answer is reused when the page re-reads the status after an action. */
const GITHUB_GOOD_FOR_MS = 60 * 1000

/** How long a collected status stays good for looking up the repository an action names. */
const KNOWN_FOR_MS = 5 * 60 * 1000

/** How many ports past the default to try before giving up, when the port was not asked for. */
const PORT_ATTEMPTS = 10

/**
 * The root a request names. The page always sends the absolute path it was given by this server,
 * so anything else is a request built by hand — and gets told so.
 */
const rootOf = (asked: string | null) => {
  if (!asked) throw new ConfigError('il manque le dossier parent dans la requête')
  if (!path.isAbsolute(asked)) throw new ConfigError(`chemin relatif : ${asked}`)
  return path.resolve(asked)
}

const loginsOf = (value: unknown) =>
  asArray(value).filter((item): item is string => typeof item === 'string')

/** What a refused request is answered with: a status, and the reason in words. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const serveZeus = ({
  launchRoot,
  port,
  host = '127.0.0.1',
  version = '',
  open = false,
  fallback = false,
}: {
  /** The root Zeus was started in or beneath; null opens on the welcome page. */
  launchRoot: string | null
  port: number
  host?: string
  version?: string
  /** Hand the page to the default browser once the port is bound. */
  open?: boolean
  /** Move on to the next port when this one is held by something else. */
  fallback?: boolean
}) => {
  const built = clientIsBuilt()
  // Set by `pnpm dev`: the page then lives on the Vite dev server, not in dist/client.
  const devWeb = process.env.ZEUS_DEV ? (process.env.ZEUS_WEB ?? 'http://localhost:4901') : null
  const cwd = process.cwd()

  /**
   * The config is read again on every request, so an edit to `.zeus/config.json` shows on the next
   * refresh; the status is collected afresh too, since its whole point is to say what is true now.
   */
  const known = new Map<string, { at: number; payload: StatusPayload }>()
  const status = async (root: string, fresh = true) => {
    const payload = await collectStatus(loadHome(root), version, {
      githubMaxAgeMs: fresh ? 0 : GITHUB_GOOD_FOR_MS,
    })
    known.set(root, { at: Date.now(), payload })
    return payload
  }
  /**
   * What an action looks its repository up in. Updating thirty clones must not ask GitHub thirty
   * times who they are, so the status the page was just shown is good for a few minutes.
   */
  const knownStatus = async (root: string) => {
    const kept = known.get(root)
    return kept && Date.now() - kept.at < KNOWN_FOR_MS ? kept.payload : await status(root, false)
  }

  /**
   * The accounts this server read from `gh` itself. Leaving one out, at set-up or later, names
   * it; only a name that is in here is ever written to a config.
   */
  const accounts = async (): Promise<Owner[]> => (await listOwners(KNOWN_FOR_MS)).owners
  const knownLogins = async (asked: string[]) => {
    const listed = await accounts()
    const stranger = asked.find((login) => !listed.some((owner) => owner.login === login))
    if (stranger !== undefined) {
      throw new Refusal(400, `${stranger} n'est pas un compte que ton gh connaît`)
    }
    return asked
  }

  /**
   * The body of a request that asks for something to be done. Every door a page on another origin
   * could use is shut before the body is even read.
   */
  const bodyOf = async (request: http.IncomingMessage): Promise<Json> => {
    if (request.method !== 'POST') throw new Refusal(405, 'cette route attend un POST')
    if (!mayAct(request.headers, devWeb ? [new URL(devWeb).origin] : [])) {
      throw new Refusal(403, 'une action ne se lance que depuis la page elle-même')
    }
    const body = asRecord(await readBody(request))
    if (!body) throw new Refusal(400, 'le corps de la requête doit être un objet JSON')
    return body
  }

  /**
   * An action on a repository is given a root and an id, and nothing else to trust: the
   * repository is looked up in a status this server collected itself, so the URL and the paths
   * are never the request's.
   */
  const onRepo = async (
    request: http.IncomingMessage,
    run: (payload: StatusPayload, id: string, body: Json) => Promise<ActionResult | null>,
  ) => {
    const body = await bodyOf(request)
    const id = asString(body.id)
    if (!id) throw new Refusal(400, 'il manque « id » dans la requête')
    const result = await run(await knownStatus(rootOf(asString(body.root))), id, body)
    if (!result) throw new Refusal(404, `aucun repo suivi ne s'appelle ${id}`)
    return result
  }

  const api = async (request: http.IncomingMessage, url: URL): Promise<unknown> => {
    switch (url.pathname) {
      case '/api/homes': {
        const payload: HomesPayload = {
          launch: launchRoot,
          candidates: discoverHomes(launchRoot, cwd, url.searchParams.getAll('also')),
          here: describeTarget(cwd),
          version,
        }
        return payload
      }
      case '/api/home': {
        const checked = checkHome(url.searchParams.get('dir') ?? '', launchRoot)
        if ('error' in checked) throw new Refusal(400, checked.error)
        return checked.candidate
      }
      case '/api/status':
        // « Actualiser » asks GitHub again; the re-read after an action only re-reads the clones.
        return status(rootOf(url.searchParams.get('root')), url.searchParams.get('fresh') !== '0')
      case '/api/details':
        // What the status left for later, asked once the page is on screen: slow on a large org.
        return collectDetails(loadHome(rootOf(url.searchParams.get('root'))))
      case '/api/clone':
        return onRepo(request, async (current, id, body) => {
          const repo = current.repos.find((candidate) => candidate.id === id)
          return repo ? cloneRepo(current, repo, asString(body.folder)) : null
        })
      case '/api/update':
        return onRepo(request, async (current, id) => {
          const repo = current.repos.find((candidate) => candidate.id === id)
          return repo ? updateRepo(repo) : null
        })

      // A tool installed with a click. The request names a tool and at most a repository; what
      // is run is the recipe this root holds for that tool, in a clone this server found itself.
      case '/api/tools/install': {
        const body = await bodyOf(request)
        const root = rootOf(asString(body.root))
        const tool = toolsOf(loadHome(root)).find(
          (candidate) => candidate.id === asString(body.tool),
        )
        if (!tool) throw new Refusal(404, `aucun outil ne s'appelle ${asString(body.tool) ?? ''}`)
        const repoId = asString(body.repo)
        const repo = repoId
          ? (await knownStatus(root)).repos.find((candidate) => candidate.id === repoId)
          : undefined
        if (repoId && !repo) throw new Refusal(404, `aucun repo suivi ne s'appelle ${repoId}`)
        const result = await installTool(tool, {
          root,
          repoId: repo?.id ?? null,
          clone: repo?.local ?? null,
        })
        // What is in place has changed: the next status must not be the one kept from before.
        known.delete(root)
        return result
      }

      // Which accounts a root follows: all of them, minus the ones named here.
      case '/api/accounts': {
        const body = await bodyOf(request)
        const root = rootOf(asString(body.root))
        loadHome(root)
        const hidden = await knownLogins(loginsOf(body.hidden))
        saveHiddenOwners(
          root,
          hidden.map((login) => login.toLowerCase()),
        )
        known.delete(root)
        return { hidden }
      }

      // Which repositories of a followed account a root follows: the ones named here, or all of
      // them when every one is. Only a name GitHub lists for that account is ever written.
      case '/api/accounts/repos': {
        const body = await bodyOf(request)
        const root = rootOf(asString(body.root))
        const home = loadHome(root)
        const [login = ''] = await knownLogins([asString(body.login) ?? ''])
        if (home.config.hiddenOwners.includes(login.toLowerCase())) {
          throw new Refusal(400, `${login} n'est pas suivi dans ce dossier`)
        }
        const { listed, error } = await listOwnerRepos(login, GITHUB_GOOD_FOR_MS)
        if (listed.length === 0 && error) {
          throw new Refusal(502, `GitHub n'a pas listé les repos de ${login} : ${error}`)
        }
        const names = new Map(listed.map(({ repo }) => [repo.name.toLowerCase(), repo.name]))
        const asked = loginsOf(body.repos)
        const stranger = asked.find((name) => !names.has(name.toLowerCase()))
        if (stranger !== undefined) {
          throw new Refusal(400, `${stranger} n'est pas un repo de ${login}`)
        }
        if (asked.length === 0) {
          throw new Refusal(
            400,
            `coche au moins un repo — pour ne rien suivre de ${login}, décoche le compte`,
          )
        }
        const kept = new Set(asked.map((name) => name.toLowerCase()))
        // Every repository the page offered is ticked: the whole account, those to come included.
        const offered =
          (await knownStatus(root)).workspaces.find((workspace) => workspace.login === login)
            ?.repoNames ?? []
        const all = offered.every((name) => kept.has(name.toLowerCase()))
        const repos = all ? null : [...kept].map((name) => names.get(name) ?? name)
        saveFollowedRepos(root, login, repos)
        known.delete(root)
        return { login, repos }
      }

      // Setting a root up: what the machine has, where the projects are, who can be followed.
      case '/api/machine':
        return checkMachine()
      case '/api/owners':
        return listOwners()
      case '/api/setup/target':
        return describeTarget(resolveTarget(url.searchParams.get('dir') ?? cwd))
      case '/api/setup/create': {
        const body = await bodyOf(request)
        const root = createHome({
          dir: resolveTarget(asString(body.dir) ?? ''),
          hiddenOwners: await knownLogins(loginsOf(body.hidden)),
        })
        return { root }
      }

      // A prompt handed to the Claude desktop app, on the root. Filled in, never sent.
      case '/api/claude/open': {
        const body = await bodyOf(request)
        const prompt = asString(body.prompt)
        if (!prompt) throw new Refusal(400, 'il manque « prompt » dans la requête')
        const root = rootOf(asString(body.root))
        loadHome(root)
        try {
          await openUrl(claudeLink(prompt, root))
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'erreur inconnue'
          throw new Refusal(502, `l'application Claude ne s'est pas ouverte : ${reason}`)
        }
        return { opened: true }
      }
      default:
        // Named, so a page talking to an older server says which route that server is missing.
        throw new Refusal(404, `route d'API inconnue : ${url.pathname}`)
    }
  }

  const handle = async (request: http.IncomingMessage, response: http.ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (!isAllowedHost(request.headers.host, host)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Ce serveur ne répond qu’à localhost.\n')
      return
    }

    if (url.pathname.startsWith('/api/')) {
      if (isForeign(request.headers)) {
        json(response, { error: 'cette API ne répond qu’à sa propre page' }, 403)
        return
      }
      json(response, await api(request, url))
      return
    }

    if (devWeb) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(devPage(devWeb))
      return
    }
    if (!built) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(MISSING_CLIENT)
      return
    }
    // One bundle draws every screen: a path that is not a file of it is a screen of the page.
    if (!serveClientFile(url.pathname, response) && !serveClientFile('/', response)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('introuvable\n')
    }
  }

  const server = http.createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      // A refusal carries its own status; a config the user must fix is a 400 with its message;
      // anything else is ours, and is not shown.
      const [code, message] =
        error instanceof Refusal
          ? [error.status, error.message]
          : error instanceof ConfigError
            ? [400, error.message]
            : [500, 'erreur interne du serveur']
      if (code === 500) console.error(error)
      if (response.headersSent) response.end()
      else json(response, { error: message }, code)
    })
  })

  let attempt = 0
  const listen = () => server.listen(port + attempt, host)
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && fallback && attempt < PORT_ATTEMPTS) {
      attempt += 1
      listen()
      return
    }
    console.error(
      error.code === 'EADDRINUSE'
        ? `✗ le port ${port + attempt} est déjà pris — passe --port <n>`
        : `✗ ${error.message}`,
    )
    process.exit(1)
  })
  server.on('listening', () => {
    const api = pageUrl(host, port + attempt)
    // Started in a root, or anywhere beneath one, the page opens on it; elsewhere, on the welcome page.
    const page = `${devWeb ?? api}${launchRoot ? fleetPath(launchRoot) : '/'}`
    console.log(devWeb ? `zeus : API sur ${api}, page sur ${page}` : `zeus : ${page}`)
    if (!built && !devWeb) console.error(MISSING_CLIENT)
    if (open) openInBrowser(page)
  })
  listen()
  return server
}
