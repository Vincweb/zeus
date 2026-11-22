import { useEffect, useRef } from 'react'
import type { JournalEntry } from '../../shared/types'
import { Console } from './Console'
import { Button, CrossIcon, TerminalIcon } from './ui'

/**
 * Zeus's terminal: the journal of its server, in a window that comes up from the bottom of the
 * page and over it — Escape, the cross or a click above it puts it away. What has ended can be
 * closed, one entry or all of them; what runs is stopped first.
 */
export const TerminalSheet = ({
  entries,
  selected,
  onSelect,
  onStop,
  onDismiss,
  onClose,
}: {
  entries: JournalEntry[]
  selected: number | null
  onSelect: (id: number) => void
  onStop: (id: number) => void
  onDismiss: (id: number | 'finished') => void
  onClose: () => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  const ended = entries.filter((entry) => entry.kind !== 'zeus' && entry.state !== 'running').length

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the dimmed page above puts it away; inside, it lands on the content.
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close()
      }}
      aria-labelledby="terminal-title"
      className="fixed inset-x-0 top-auto bottom-0 m-0 h-[min(72vh,680px)] max-h-none w-full max-w-none animate-sheet overflow-hidden rounded-t-2xl border border-b-0 border-line bg-panel p-0 text-text shadow-lift"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line px-4 py-2.5">
          <TerminalIcon className="text-muted" />
          <h2 id="terminal-title" className="text-[14px] font-semibold">
            Terminal
          </h2>
          <span className="hidden text-[12px] text-faint sm:inline">
            ce que le serveur de Zeus a lancé, et ce qu’il a répondu
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {ended > 0 && (
              <Button onClick={() => onDismiss('finished')}>Fermer les terminés ({ended})</Button>
            )}
            <Button onClick={() => ref.current?.close()} aria-label="Fermer le terminal">
              <CrossIcon />
            </Button>
          </span>
        </header>
        <div className="min-h-0 flex-1">
          <Console
            entries={entries}
            selected={selected}
            onSelect={onSelect}
            onStop={onStop}
            onDismiss={onDismiss}
          />
        </div>
      </div>
    </dialog>
  )
}
