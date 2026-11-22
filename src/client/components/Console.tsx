import { useEffect, useRef, useState } from 'react'
import type { JournalEntry } from '../../shared/types'
import { fetchJournalLines } from '../api'
import { clock } from '../format'
import { Badge, Button, CheckIcon, CrossIcon, Spinner, cx, type Tone } from './ui'

const STATES: Record<JournalEntry['state'], { label: string; tone: Tone }> = {
  running: { label: 'En cours', tone: 'info' },
  ok: { label: 'Terminé', tone: 'ok' },
  failed: { label: 'En échec', tone: 'danger' },
  stopped: { label: 'Arrêté', tone: 'neutral' },
}

const KINDS: Record<JournalEntry['kind'], string> = {
  zeus: 'Serveur',
  action: 'Action',
  tool: 'Outil',
}

const StateMark = ({ state }: { state: JournalEntry['state'] }) =>
  state === 'running' ? (
    <Spinner className="text-info" />
  ) : state === 'ok' ? (
    <CheckIcon className="text-ok" width="12" height="12" />
  ) : state === 'failed' ? (
    <CrossIcon className="text-danger" width="12" height="12" />
  ) : (
    <span className="inline-block size-2 rounded-[2px] bg-faint" aria-hidden="true" />
  )

/** How long it took, or has been taking: « 3 s », « 2 min ». */
const lasted = (entry: JournalEntry, now: number) => {
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
  const seconds = Math.max(0, Math.round((end - new Date(entry.startedAt).getTime()) / 1000))
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
}

/** The time, again every second while something runs: durations that are still growing. */
const useNow = (ticking: boolean) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [ticking])
  return now
}

/**
 * The lines of one entry, fetched from where the last fetch stopped, again and again while it
 * runs. When the server no longer keeps the first lines asked for, what it kept is shown.
 */
const useLines = (entry: JournalEntry | null) => {
  const [state, setState] = useState<{ id: number; from: number; lines: string[] }>({
    id: 0,
    from: 0,
    lines: [],
  })
  const id = entry?.id ?? 0
  const total = entry?.lines ?? 0
  useEffect(() => {
    if (id === 0) return
    let cancelled = false
    const have = state.id === id ? state.from + state.lines.length : 0
    if (state.id === id && have >= total) return
    void fetchJournalLines(id, have)
      .then((answer) => {
        if (cancelled) return
        setState((current) =>
          current.id === id && answer.from === current.from + current.lines.length
            ? { ...current, lines: [...current.lines, ...answer.lines].slice(-1000) }
            : { id, from: answer.from, lines: answer.lines },
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // `state` is read to know where to start; refetching follows the entry, not the lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, total])
  return state.id === id ? state.lines : []
}

/**
 * The console of the page: what Zeus's server did — its own lines, each action with the commands
 * it ran, the tools started from here with what they print as they print it. A tool that runs can
 * be stopped, and the page it serves opened.
 */
export const Console = ({
  entries,
  selected,
  onSelect,
  onStop,
  onDismiss,
}: {
  entries: JournalEntry[]
  selected: number | null
  onSelect: (id: number) => void
  onStop: (id: number) => void
  /** Closes an entry that is over. */
  onDismiss: (id: number) => void
}) => {
  const current = entries.find((entry) => entry.id === selected) ?? entries[0] ?? null
  const lines = useLines(current)
  const output = useRef<HTMLPreElement>(null)
  const following = useRef(true)
  const now = useNow(entries.some((entry) => entry.state === 'running'))

  // New lines keep the view at the bottom, unless it was scrolled up to read.
  useEffect(() => {
    const pre = output.current
    if (pre && following.current) pre.scrollTop = pre.scrollHeight
  }, [lines.length, current?.id])

  if (!current) {
    return (
      <p className="px-4 py-6 text-center text-[12.5px] text-muted">
        Rien pour l’instant : les clones, les mises à jour, les installations et les outils lancés
        d’ici s’affichent ici, avec ce qu’ils écrivent.
      </p>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <ul className="m-0 max-h-36 shrink-0 list-none overflow-y-auto border-b border-line p-1 sm:max-h-none sm:w-72 sm:border-r sm:border-b-0">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cx(
              'group flex items-start rounded-md hover:bg-raised',
              entry.id === current.id && 'bg-raised',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              aria-current={entry.id === current.id}
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
            >
              <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                <StateMark state={entry.state} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{entry.title}</span>
                <span className="block truncate text-[11px] text-faint">
                  {KINDS[entry.kind]} · {clock(entry.startedAt)}
                  {entry.kind !== 'zeus' && ` · ${lasted(entry, now)}`}
                </span>
              </span>
            </button>
            {entry.kind !== 'zeus' && entry.state !== 'running' && (
              <button
                type="button"
                onClick={() => onDismiss(entry.id)}
                title="Fermer"
                aria-label={`Fermer ${entry.title}`}
                className="m-1 shrink-0 rounded p-1 text-faint opacity-60 group-hover:opacity-100 hover:bg-line-soft hover:text-text focus-visible:opacity-100"
              >
                <CrossIcon width="11" height="11" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Sortie">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line px-3 py-2">
          <span className="text-[13px] font-semibold">{current.title}</span>
          {current.kind !== 'zeus' && (
            <Badge tone={STATES[current.state].tone}>{STATES[current.state].label}</Badge>
          )}
          {current.where && (
            <span className="font-mono text-[11.5px] text-faint">{current.where}</span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {current.url && (
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium text-accent hover:underline"
              >
                Ouvrir {current.url.replace(/^https?:\/\//, '')}
              </a>
            )}
            {current.kind === 'tool' && current.state === 'running' && (
              <Button onClick={() => onStop(current.id)}>Arrêter</Button>
            )}
            {current.kind !== 'zeus' && current.state !== 'running' && (
              <Button onClick={() => onDismiss(current.id)}>Fermer</Button>
            )}
          </span>
        </div>
        {/* A tool's line heads its output; an action writes each of its commands in it already. */}
        {current.kind === 'tool' && current.command && (
          <div className="border-b border-line-soft px-3 py-1 font-mono text-[11.5px] break-all text-muted">
            $ {current.command}
          </div>
        )}
        <pre
          ref={output}
          onScroll={(event) => {
            const pre = event.currentTarget
            following.current = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24
          }}
          className="m-0 min-h-0 flex-1 overflow-auto bg-bg px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-text"
        >
          {lines.length > 0 ? lines.join('\n') : current.state === 'running' ? '…' : ''}
        </pre>
      </section>
    </div>
  )
}
