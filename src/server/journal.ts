import { AsyncLocalStorage } from 'async_hooks'
import { spawn, type ChildProcess } from 'child_process'
import type { JournalEntry, JournalLines, RunState } from '../shared/types'
import { quietEnv, type ExecResult } from './exec'

/** Bounds, so that a chatty tool — a progress bar with no newline — cannot fill the memory. */
const MAX_ENTRIES = 80
const MAX_LINES = 1000
const MAX_LINE = 2000

/** A tool asked to stop and still there after this is stopped for good. */
const STOP_GRACE_MS = 3000

// Terminal escapes are control characters: matching them is the point.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g

/** A page served on this machine, as tools announce it: `http://127.0.0.1:4800`. */
const LOCAL_URL = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s'"<>)\]]*)?/

/** A command as it is shown: git's `-c key=value` options are configuration, not what was asked. */
export const displayLine = (command: string, args: string[]) => {
  const shown: string[] = [command]
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '-c' && command === 'git') index += 1
    else shown.push(args[index] ?? '')
  }
  return shown.join(' ')
}

type Entry = JournalEntry & {
  kept: string[]
  /** Text after the last newline of each stream, waiting for the rest of its line. */
  partial: Record<'out' | 'err', string>
  child: ChildProcess | null
  stopping: boolean
  key: string | null
}

const publicOf = (entry: Entry): JournalEntry => ({
  id: entry.id,
  kind: entry.kind,
  title: entry.title,
  command: entry.command,
  where: entry.where,
  toolId: entry.toolId,
  startedAt: entry.startedAt,
  endedAt: entry.endedAt,
  state: entry.state,
  url: entry.url,
  lines: entry.lines,
  lastLine: entry.lastLine,
})

/** Sends a signal to a tool and all it started: its own process group, where there is one. */
const signal = (child: ChildProcess, name: NodeJS.Signals) => {
  if (child.pid === undefined) return
  try {
    if (process.platform === 'win32') child.kill(name)
    else process.kill(-child.pid, name)
  } catch {
    // Already gone.
  }
}

export type Journal = ReturnType<typeof createJournal>

/**
 * What the page's server did, to show on the page: its own lines, each action with the commands it
 * ran and what they printed, and the tools started from the page, whose output arrives as it is
 * written. Kept in memory, bounded, and gone with the server — and so are the tools it started.
 */
export const createJournal = () => {
  let nextId = 1
  const entries: Entry[] = []
  const acting = new AsyncLocalStorage<Entry>()
  let zeus: Entry | null = null

  const open = (
    kind: Entry['kind'],
    title: string,
    { command = null, where = null, toolId = null, key = null }: Partial<Entry> = {},
  ) => {
    const entry: Entry = {
      id: nextId++,
      kind,
      title,
      command,
      where,
      toolId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      state: 'running',
      url: null,
      lines: 0,
      lastLine: null,
      kept: [],
      partial: { out: '', err: '' },
      child: null,
      stopping: false,
      key,
    }
    entries.push(entry)
    // The oldest finished ones go first; what still runs, and the server's own lines, stay.
    while (entries.length > MAX_ENTRIES) {
      const index = entries.findIndex((old) => old.state !== 'running' && old !== zeus)
      if (index === -1) break
      entries.splice(index, 1)
    }
    return entry
  }

  const write = (entry: Entry, line: string) => {
    const clean = line.replace(ANSI, '').slice(0, MAX_LINE)
    entry.kept.push(clean)
    if (entry.kept.length > MAX_LINES) entry.kept.shift()
    entry.lines += 1
    if (clean.trim() !== '') entry.lastLine = clean
    if (entry.url === null) entry.url = LOCAL_URL.exec(clean)?.[0] ?? null
  }

  /** Text as a stream delivers it: whole lines are written, a carriage return rewrites the last. */
  const feed = (entry: Entry, stream: 'out' | 'err', text: string) => {
    const pieces = (entry.partial[stream] + text.replace(/\r\n/g, '\n')).split('\n')
    entry.partial[stream] = (pieces.pop() ?? '').slice(-MAX_LINE)
    for (const piece of pieces) write(entry, piece.slice(piece.lastIndexOf('\r') + 1))
  }

  const flush = (entry: Entry) => {
    for (const stream of ['out', 'err'] as const) {
      const rest = entry.partial[stream]
      if (rest !== '') write(entry, rest.slice(rest.lastIndexOf('\r') + 1))
      entry.partial[stream] = ''
    }
  }

  const finish = (entry: Entry, state: RunState) => {
    if (entry.state !== 'running') return
    flush(entry)
    entry.state = state
    entry.endedAt = new Date().toISOString()
  }

  /** A line of the server itself, kept in its own entry and printed to its terminal as before. */
  const log = (line: string, level: 'info' | 'error' = 'info') => {
    if (!zeus) {
      zeus = open('zeus', 'Serveur Zeus')
      // A log, not a run: nothing waits on it, and nothing polls for it to end.
      zeus.state = 'ok'
    }
    for (const piece of line.split('\n')) write(zeus, piece)
    if (level === 'error') console.error(line)
    else console.log(line)
  }

  /**
   * Runs an action with every command it starts written down: each one, then what it printed. The
   * outcome says how it ended, in one line.
   */
  const track = async <T>(
    title: string,
    where: string | null,
    work: () => Promise<T>,
    outcome: (result: T) => { ok: boolean; message: string },
  ): Promise<T> => {
    const entry = open('action', title, { where })
    try {
      const result = await acting.run(entry, work)
      const { ok, message } = outcome(result)
      write(entry, `→ ${message}`)
      finish(entry, ok ? 'ok' : 'failed')
      return result
    } catch (error) {
      write(entry, `→ ${error instanceof Error ? error.message : 'échec'}`)
      finish(entry, 'failed')
      throw error
    }
  }

  /** What `exec` reports of a command: kept only when an action is under way. */
  const recordCommand = (command: string, args: string[], result: ExecResult) => {
    const entry = acting.getStore()
    if (!entry || entry.state !== 'running') return
    const line = displayLine(command, args)
    entry.command = line
    write(entry, `$ ${line}`)
    feed(entry, 'out', result.stdout)
    feed(entry, 'err', result.stderr)
    flush(entry)
    if (!result.ok) {
      write(
        entry,
        result.timedOut
          ? '  (délai dépassé)'
          : `  (code ${result.code === null ? 'introuvable' : result.code})`,
      )
    }
  }

  /**
   * Starts a tool and keeps its output. Without a shell and without a stdin — nobody is there to
   * answer — and in a process group of its own, so that stopping it stops what it started too: the
   * server behind `npx …` is a grandchild. A tool already running in the same place is not started
   * twice; its entry is given back.
   */
  const start = ({
    title,
    words,
    cwd,
    where,
    toolId,
  }: {
    title: string
    words: string[]
    cwd: string
    where: string
    toolId: string
  }) => {
    const key = `${toolId}@${cwd}`
    const running = entries.find((entry) => entry.key === key && entry.state === 'running')
    if (running) return publicOf(running)
    const [command = '', ...args] = words
    const entry = open('tool', title, { command: words.join(' '), where, toolId, key })
    const child = spawn(command, args, {
      cwd,
      env: quietEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
    entry.child = child
    child.stdout.setEncoding('utf8').on('data', (text: string) => feed(entry, 'out', text))
    child.stderr.setEncoding('utf8').on('data', (text: string) => feed(entry, 'err', text))
    child.on('error', (error) => {
      write(entry, `${command} : ${error.message}`)
      finish(entry, 'failed')
    })
    child.on('close', (code, closedBy) => {
      entry.child = null
      flush(entry)
      write(
        entry,
        entry.stopping
          ? '→ arrêté'
          : `→ terminé${code === null ? ` (${closedBy ?? 'signal'})` : ` (code ${code})`}`,
      )
      finish(entry, entry.stopping ? 'stopped' : code === 0 ? 'ok' : 'failed')
    })
    return publicOf(entry)
  }

  /** Stops a tool started from the page, and what it started. False when nothing runs there. */
  const stop = (id: number) => {
    const entry = entries.find((candidate) => candidate.id === id)
    const child = entry?.child
    if (!entry || !child) return false
    entry.stopping = true
    signal(child, 'SIGTERM')
    setTimeout(() => {
      if (entry.child === child) signal(child, 'SIGKILL')
    }, STOP_GRACE_MS).unref()
    return true
  }

  /** Every tool still running, stopped at once: the server is going. */
  const stopAll = () => {
    for (const entry of entries) {
      if (entry.child) {
        entry.stopping = true
        signal(entry.child, 'SIGKILL')
      }
    }
  }

  const list = (): JournalEntry[] => [...entries].reverse().map(publicOf)

  const linesOf = (id: number, from: number): JournalLines | null => {
    const entry = entries.find((candidate) => candidate.id === id)
    if (!entry) return null
    const first = entry.lines - entry.kept.length
    const start = Math.max(from, first)
    return { id, from: start, total: entry.lines, lines: entry.kept.slice(start - first) }
  }

  return { log, track, recordCommand, start, stop, stopAll, list, linesOf }
}

/**
 * Ties the tools a journal started to the life of this process: they are stopped when it ends, by
 * itself or by a signal — after which the signal is raised again, so the process ends as it would
 * have. Detached in groups of their own, the tools would otherwise outlive it, holding their ports.
 */
export const stopWithProcess = (journal: Journal) => {
  process.on('exit', () => journal.stopAll())
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    const onSignal = () => {
      journal.stopAll()
      process.removeListener(name, onSignal)
      process.kill(process.pid, name)
    }
    process.on(name, onSignal)
  }
}
