import type { ReactNode } from 'react'
import type { JournalEntry } from '../../shared/types'
import { Console } from './Console'
import { Badge, BoltIcon, ChevronIcon, Spinner, TerminalIcon, cx } from './ui'

const REPOSITORY = 'https://github.com/Vincweb/zeus'

const FooterLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="hover:text-text hover:underline">
    {children}
  </a>
)

/**
 * The bar at the bottom of a fleet: which Zeus this is, where to read about it or report a
 * problem, and the console — what its server did and what the tools started from here print —
 * which opens above the bar.
 */
export const Footer = ({
  version,
  entries,
  open,
  selected,
  unseenFailures,
  onToggle,
  onSelect,
  onStop,
}: {
  /** The version of the server answering, which is the Zeus at work. */
  version: string
  entries: JournalEntry[]
  open: boolean
  selected: number | null
  /** Actions and tools that failed since the console was last looked at. */
  unseenFailures: number
  onToggle: () => void
  onSelect: (id: number) => void
  onStop: (id: number) => void
}) => {
  const running = entries.filter((entry) => entry.state === 'running' && entry.kind !== 'zeus')
  const shownVersion = version || __APP_VERSION__
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 shadow-lift backdrop-blur">
      {open && (
        <div
          id="zeus-console"
          className="h-[min(46vh,420px)] border-b border-line"
          role="region"
          aria-label="Console de Zeus"
        >
          <Console entries={entries} selected={selected} onSelect={onSelect} onStop={onStop} />
        </div>
      )}
      <div className="mx-auto flex h-9 max-w-[1280px] items-center gap-3 px-4 text-[11.5px] text-faint sm:px-6">
        <span className="flex items-center gap-1.5 text-muted">
          <BoltIcon className="text-accent" width="12" height="12" />
          <span className="font-medium">Zeus {shownVersion}</span>
        </span>
        {__APP_DEV__ && (
          <Badge tone="warn" title="La page vient de Vite : Zeus est en cours de développement">
            dev
          </Badge>
        )}
        <span className="hidden truncate md:inline">
          sert cette machine uniquement · lit GitHub avec ton <span className="font-mono">gh</span>
        </span>
        <nav className="ml-auto flex items-center gap-3" aria-label="Zeus">
          <span className="hidden items-center gap-3 sm:flex">
            <FooterLink href={REPOSITORY}>GitHub</FooterLink>
            <FooterLink href={`${REPOSITORY}#readme`}>Documentation</FooterLink>
            <FooterLink href={`${REPOSITORY}/issues`}>Signaler un problème</FooterLink>
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls="zeus-console"
            className={cx(
              'inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium',
              open
                ? 'border-accent-fill bg-accent-soft text-accent'
                : 'border-line text-muted hover:bg-raised hover:text-text',
            )}
          >
            <TerminalIcon width="12" height="12" />
            Console
            {running.length > 0 && (
              <span className="inline-flex items-center gap-1 text-info">
                <Spinner className="size-3" />
                {running.length}
              </span>
            )}
            {unseenFailures > 0 && (
              <span className="rounded-full bg-danger-soft px-1.5 text-danger">
                {unseenFailures}
              </span>
            )}
            <ChevronIcon
              width="11"
              height="11"
              className={cx('transition-transform', open ? 'rotate-90' : '-rotate-90')}
            />
          </button>
        </nav>
      </div>
    </footer>
  )
}
