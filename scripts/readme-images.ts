// Regenerates docs/media from an invented fleet (scripts/demo-fleet.ts).
//
// The built Zeus runs for real: in a throwaway home, over real git clones made here, with a
// stand-in for `gh` that answers from files — so no account or repository in the pictures is
// real, and nothing reaches GitHub. Headless Chrome is driven over the DevTools protocol, as
// code-atlas does.
import { execFileSync, spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { asArray, asNumber, asRecord, asString, at, parseJson } from '../src/server/json'
import { CONFIG, FLEET, ORG, STRAYS, USER, type DemoRepo } from './demo-fleet'

const repo = path.resolve(import.meta.dirname, '..')
const media = path.join(repo, 'docs', 'media')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 4898
const DEBUG_PORT = 9338
const origin = `http://127.0.0.1:${PORT}`

// macOS hands out temp folders through a symlink; the root must be named the way git and Zeus
// will resolve it, or the page would show a full path where `~/Projects` belongs.
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-readme-')))
const home = path.join(work, 'home')
const root = path.join(home, 'Projects')
const bin = path.join(work, 'bin')
const github = path.join(work, 'github')

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()

const write = (file: string, text: string, mode?: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, mode === undefined ? {} : { mode })
}

/** git, deaf to the config of whoever runs this, and dated when the fleet says. */
const git = (dir: string, args: string[], at = now) => {
  const date = new Date(at).toISOString()
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.test',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.test',
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  }).trim()
}

const commit = (dir: string, message: string, at: number) => {
  git(dir, ['add', '-A'], at)
  git(dir, ['commit', '--quiet', '-m', message], at)
  return git(dir, ['rev-parse', 'HEAD'])
}

/** How many commits a demo clone starts with: enough to fall behind by a few. */
const HISTORY = 6

/**
 * Makes the clone of a repository in the state the fleet gives it. Returns the commit GitHub is
 * said to hold at the tip of its default branch — one this clone knows, unless the point is that
 * it does not.
 */
const makeClone = (owner: string, entry: DemoRepo, clone: NonNullable<DemoRepo['clone']>) => {
  const dir = path.join(root, clone.path)
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ['init', '--quiet', '-b', 'main'])
  git(dir, ['remote', 'add', 'origin', `git@github.com:${owner}/${entry.name}.git`])

  write(path.join(dir, 'README.md'), `# ${entry.name}\n\n${entry.description}.\n`)
  if (clone.npm) {
    const tool = clone.codeAtlas ? { '@vincweb/code-atlas': '^0.6.0' } : {}
    const manifest = {
      name: entry.name,
      private: true,
      devDependencies: { ...tool, typescript: '^5.7.3' },
    }
    write(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    write(path.join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  }
  if (clone.claudeMd) write(path.join(dir, 'CLAUDE.md'), `# ${entry.name}\n`)
  if (clone.workflow) write(path.join(dir, '.github/workflows/ci.yml'), 'name: CI\non: push\n')

  const last = now - entry.pushedDaysAgo * DAY
  const commits: string[] = []
  for (let index = 0; index < HISTORY; index++) {
    write(path.join(dir, 'CHANGELOG.md'), `# Changelog\n\n${index + 1} changes so far.\n`)
    commits.push(commit(dir, `Change ${index + 1}`, last - (HISTORY - 1 - index) * DAY))
  }
  const tip = commits[HISTORY - 1] ?? ''
  const back = (by: number) => commits[HISTORY - 1 - by] ?? tip

  // The upstream is a ref written by hand: there is no remote to fetch it from.
  const follow = (oid: string) => {
    git(dir, ['update-ref', 'refs/remotes/origin/main', oid])
    git(dir, ['branch', '--quiet', '--set-upstream-to=origin/main'])
  }

  const { state } = clone
  if (state.kind === 'behind') {
    follow(tip)
    git(dir, ['reset', '--quiet', '--hard', back(state.by)])
    return tip
  }
  if (state.kind === 'ahead') {
    follow(back(state.by))
    return back(state.by)
  }
  follow(tip)
  if (state.kind === 'dirty') {
    write(
      path.join(dir, 'README.md'),
      `# ${entry.name}\n\n${entry.description}. Work in progress.\n`,
    )
    write(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\nUnreleased.\n')
    write(path.join(dir, 'notes.md'), 'To sort out before the commit.\n')
  }
  // A commit this clone has never seen: forty hex digits that name nothing here.
  return state.kind === 'unfetched' ? crypto.randomBytes(20).toString('hex') : tip
}

/** Builds the root, its clones and stray folders, and what `gh` will answer about all of it. */
const buildFleet = () => {
  const details: unknown[] = []
  let serial = 0
  for (const [owner, entries] of Object.entries(FLEET)) {
    const nodes = entries.map((entry) => {
      const id = `R_demo${String(++serial).padStart(4, '0')}`
      const pushedAt = new Date(now - entry.pushedDaysAgo * DAY).toISOString()
      const head = entry.clone
        ? makeClone(owner, entry, entry.clone)
        : crypto.randomBytes(20).toString('hex')
      details.push({
        id,
        defaultBranchRef: {
          name: 'main',
          target: {
            oid: head,
            committedDate: pushedAt,
            statusCheckRollup: entry.ci ? { state: entry.ci } : null,
          },
        },
        pullRequests: { totalCount: entry.pullRequests },
        issues: { totalCount: entry.issues },
      })
      return {
        id,
        name: entry.name,
        nameWithOwner: `${owner}/${entry.name}`,
        description: entry.description,
        url: `https://github.com/${owner}/${entry.name}`,
        sshUrl: `git@github.com:${owner}/${entry.name}.git`,
        isPrivate: entry.isPrivate === true,
        isArchived: false,
        isFork: false,
        pushedAt,
        primaryLanguage: entry.language ? { name: entry.language } : null,
      }
    })
    const repositories = { pageInfo: { hasNextPage: false, endCursor: null }, nodes }
    write(
      path.join(github, `listing-${owner}.json`),
      JSON.stringify({ data: { repositoryOwner: { repositories } } }),
    )
  }
  write(path.join(github, 'details.json'), JSON.stringify({ data: { nodes: details } }))

  for (const stray of STRAYS) {
    const dir = path.join(root, stray.path)
    fs.mkdirSync(dir, { recursive: true })
    git(dir, ['init', '--quiet', '-b', 'main'])
    if (stray.origin) git(dir, ['remote', 'add', 'origin', stray.origin])
    write(path.join(dir, 'README.md'), `# ${path.basename(stray.path)}\n`)
    commit(dir, 'First commit', now - 200 * DAY)
  }

  write(path.join(root, '.zeus', 'config.json'), `${JSON.stringify(CONFIG, null, 2)}\n`)
}

/**
 * The programs Zeus calls besides git, replaced by ones that only know this fleet. `gh` is asked
 * four things — its version, who is signed in, their organizations, and GraphQL — and the answer
 * to the last one is read from the query: an `owner` variable means a listing, anything else the
 * details, which are all given at once.
 */
const buildStandIns = () => {
  write(
    path.join(bin, 'gh'),
    `#!/bin/sh
here=$(dirname "$0")
case "$*" in
  --version*) echo "gh version 2.83.1 (2026-10-14)" ;;
  "api user --jq .login") echo "${USER}" ;;
  "api user/orgs"*) echo "${ORG}" ;;
  "api graphql"*)
    for arg in "$@"; do
      case "$arg" in owner=*) cat "$here/../github/listing-\${arg#owner=}.json"; exit 0 ;; esac
    done
    cat "$here/../github/details.json" ;;
  *) echo "gh (demo): unexpected call: $*" >&2; exit 1 ;;
esac
`,
    0o755,
  )
  // ssh does not follow HOME: left alone, it would say whether the real machine has a key.
  write(
    path.join(bin, 'ssh'),
    `#!/bin/sh
echo "Hi ${USER}! You've successfully authenticated, but GitHub does not provide shell access." >&2
exit 1
`,
    0o755,
  )
  // On the PATH, which is all "installed on this machine" means for a command-line tool.
  write(path.join(bin, 'claude-context-viewer'), '#!/bin/sh\n', 0o755)
}

/**
 * A copy of the build where `npx` would have put it, so that Zeus names itself by its package —
 * as it does for whoever runs it that way — and not by the path of this checkout.
 */
const installBuild = () => {
  const pkg = path.join(
    home,
    '.npm',
    '_npx',
    '3f2a9c1d7b64e0a5',
    'node_modules',
    '@vincweb',
    'zeus',
  )
  fs.cpSync(path.join(repo, 'dist'), path.join(pkg, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(repo, 'package.json'), path.join(pkg, 'package.json'))
  return path.join(pkg, 'dist', 'cli.js')
}

const until = async <T>(check: () => Promise<T | undefined | false>, what: string): Promise<T> => {
  for (let attempt = 0; attempt < 120; attempt++) {
    const value = await check().catch(() => undefined)
    if (value) return value
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

/** A DevTools session: commands by id, and the one event navigation needs to wait for. */
const connect = async (url: string) => {
  const socket = new WebSocket(url)
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done()
    socket.onerror = () => fail(new Error('Chrome refused the DevTools connection'))
  })
  let next = 0
  const pending = new Map<number, (message: Record<string, unknown>) => void>()
  const waiting: { method: string; done: () => void }[] = []
  socket.onmessage = (event: MessageEvent) => {
    const data: unknown = event.data
    const message = asRecord(parseJson(typeof data === 'string' ? data : ''))
    if (!message) return
    if (typeof message.id === 'number') {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
      return
    }
    for (const waiter of waiting.filter((item) => item.method === message.method)) {
      waiting.splice(waiting.indexOf(waiter), 1)
      waiter.done()
    }
  }
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<unknown>((done, fail) => {
      const id = ++next
      pending.set(id, (message) => {
        const error = asString(at(message.error, 'message'))
        if (error) fail(new Error(`${method}: ${error}`))
        else done(message.result)
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const once = (method: string) => new Promise<void>((done) => waiting.push({ method, done }))
  return { send, once, close: () => socket.close() }
}

type Shot = {
  name: string
  url: string
  width: number
  height: number
  /** An element that shows the page has what the picture is of. */
  ready?: string
  /** An element to bring to the top of the picture. */
  top?: string
}

const main = async () => {
  if (!fs.existsSync(path.join(repo, 'dist', 'cli.js'))) {
    throw new Error('No build to take pictures of: run `pnpm build` first')
  }
  fs.mkdirSync(media, { recursive: true })
  buildFleet()
  buildStandIns()
  const cli = installBuild()

  // Whatever points Zeus or Claude Code at the real machine is left out of the child's world.
  const {
    CLAUDE_CONFIG_DIR: _claude,
    ZEUS_ROOT: _root,
    ZEUS_DEV: _dev,
    ZEUS_WEB: _web,
    ...inherited
  } = process.env
  const env = { ...inherited, HOME: home, PATH: `${bin}${path.delimiter}${inherited.PATH ?? ''}` }

  const server = spawn(process.execPath, [cli, '--no-open', '--port', `${PORT}`], {
    cwd: root,
    env,
    stdio: 'ignore',
  })
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${path.join(work, 'profile')}`,
      '--no-first-run',
      '--hide-scrollbars',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  try {
    await until(() => fetch(`${origin}/api/homes`).then((response) => response.ok), 'the server')
    const target = await until(
      () =>
        fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
          .then((response) => response.json())
          .then((targets: unknown) => {
            const tab = asArray(targets).find((item) => at(item, 'type') === 'page')
            return asString(at(tab, 'webSocketDebuggerUrl')) ?? undefined
          }),
      'Chrome',
    )
    const page = await connect(target)
    await page.send('Page.enable')
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    })
    await page.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    })

    const evaluate = async (expression: string) =>
      at(await page.send('Runtime.evaluate', { expression, awaitPromise: true }), 'result', 'value')

    // The pictures are of a made-up fleet: the name or the home of whoever runs this must not be
    // in what a page says, wherever on the page it is.
    const { username, homedir } = os.userInfo()
    const mustNotShow = [homedir, `/${username}/`]

    /** Opens a page and waits until it has stopped loading — and shows `ready`, when given. */
    const open = async (url: string, ready?: string) => {
      const loaded = page.once('Page.loadEventFired')
      await page.send('Page.navigate', { url })
      await loaded
      const shown = ready ? `!!document.querySelector(${JSON.stringify(ready)})` : 'true'
      await until(
        async () =>
          (await evaluate(
            `document.readyState === 'complete' && !document.querySelector('.skeleton') && ${shown}`,
          )) === true,
        url,
      )
      await evaluate('document.fonts.ready.then(() => true)')
      await sleep(700)
    }

    const shoot = async ({ name, url, width, height, ready, top }: Shot) => {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: false,
      })
      await open(url, ready)
      // A picture that starts further down is cut out of the whole page rather than scrolled to:
      // where the page sits after a scroll depends on what is still settling in it.
      const offset = top
        ? asNumber(
            await evaluate(
              `Math.max(0, Math.round((document.querySelector(${JSON.stringify(top)})?.getBoundingClientRect().top ?? 0) + window.scrollY - 16))`,
            ),
          )
        : 0
      const text = asString(await evaluate('document.body.innerText')) ?? ''
      const leak = mustNotShow.find((needle) => text.includes(needle))
      if (leak) throw new Error(`${name}: the page shows « ${leak} », which is not from the demo`)
      const picture = await page.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: offset ?? 0, width, height, scale: 1 },
      })
      const data = asString(at(picture, 'data'))
      if (!data) throw new Error(`${name}: Chrome gave no picture`)
      fs.writeFileSync(path.join(media, `${name}.png`), Buffer.from(data, 'base64'))
      console.log(`  ${name}.png`)
    }

    const fleet = `${origin}/fleet?root=${encodeURIComponent(root)}`
    const shots: Shot[] = [
      { name: 'fleet', url: fleet, width: 1440, height: 900, ready: 'table' },
      {
        name: 'workspace',
        url: `${fleet}&workspace=${ORG}`,
        width: 1440,
        height: 900,
        ready: 'table',
        top: 'input[placeholder^="Chercher"]',
      },
      // Shorter than the others: the page ends a little below its tools.
      {
        name: 'tools',
        url: fleet,
        width: 1440,
        height: 720,
        ready: '#tools-title',
        top: '#tools-title',
      },
      { name: 'welcome', url: `${origin}/`, width: 1440, height: 900 },
      {
        name: 'setup',
        url: `${origin}/setup?dir=${encodeURIComponent('~/Work')}`,
        width: 1440,
        height: 900,
        ready: '#step-2',
      },
      {
        name: 'banner',
        url: `file://${path.join(media, 'banner.svg')}`,
        width: 1152,
        height: 412,
      },
    ]
    // The welcome page says what it remembers of a root, and it remembers once the fleet has
    // been opened: do that first, whichever pictures were asked for.
    await open(fleet, 'table')
    const only = process.argv.slice(2)
    for (const shot of shots) {
      if (only.length === 0 || only.includes(shot.name)) await shoot(shot)
    }
    page.close()
    console.log('docs/media regenerated')
  } finally {
    browser.kill()
    server.kill()
    await sleep(300)
    fs.rmSync(work, { recursive: true, force: true })
  }
}

await main()
