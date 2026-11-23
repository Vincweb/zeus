import { useState } from 'react'
import type { ZeusVersion } from '../../shared/types'
import { CloseIcon, Command } from './ui'

/** The notes of one release, on GitHub. */
export const releaseNotes = (version: string) =>
  `https://github.com/Vincweb/zeus/releases/tag/v${version}`

/** The release whose notice was closed in this browser. */
const KEY = 'zeus.update-set-aside'

/** A convenience, nothing more: storage may be refused, and the notice then comes back. */
const readSetAside = (): string | null => {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

const rememberSetAside = (version: string) => {
  try {
    window.localStorage.setItem(KEY, version)
  } catch {
    // Closed for this page only.
  }
}

/** What to do around the command, by the way this Zeus runs. */
const STEPS_BY_VIA = {
  npm: {
    before: 'Installe la nouvelle version :',
    after: 'Puis arrête ce Zeus (Ctrl+C dans le terminal où il tourne) et relance-le.',
  },
  npx: {
    before:
      'Arrête ce Zeus (Ctrl+C dans le terminal où il tourne), puis relance-le en demandant la dernière version :',
    after: null,
  },
  unknown: { before: 'Mets Zeus à jour comme tu l’as installé, puis relance-le.', after: null },
}

/**
 * A later Zeus is published on npm: which one, and how to take it. Zeus never replaces itself — the
 * server runs the version it started with, so the command is shown, to copy, and the notice goes
 * once Zeus is started again. Closed, it stays away until the next release.
 */
export const ZeusUpdate = ({ zeus }: { zeus: ZeusVersion | null }) => {
  const [closedFor, setClosedFor] = useState(readSetAside)
  if (!zeus?.outdated || closedFor === zeus.latest) return null
  const steps = STEPS_BY_VIA[zeus.upgrade?.via ?? 'unknown']
  const close = () => {
    rememberSetAside(zeus.latest)
    setClosedFor(zeus.latest)
  }
  return (
    <section
      aria-label="Nouvelle version de Zeus"
      className="mt-4 flex items-start gap-3 rounded-xl border border-info/40 bg-info-soft px-4 py-3 text-[12.5px]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-text">
          <span className="font-semibold">Zeus {zeus.latest} est sorti</span> — cette page tourne
          sur {zeus.installed}.{' '}
          <a
            href={releaseNotes(zeus.latest)}
            target="_blank"
            rel="noreferrer"
            className="text-info hover:underline"
          >
            Voir les nouveautés
          </a>
        </p>
        <p className="mt-1 text-muted">{steps.before}</p>
        {zeus.upgrade && <Command command={zeus.upgrade.command} />}
        {steps.after && <p className="mt-1.5 text-muted">{steps.after}</p>}
      </div>
      <button
        type="button"
        onClick={close}
        title="Masquer jusqu’à la prochaine version"
        aria-label="Masquer jusqu’à la prochaine version"
        className="-mt-0.5 -mr-1.5 grid size-6 shrink-0 place-content-center rounded-md text-muted hover:bg-line-soft hover:text-text"
      >
        <CloseIcon width="12" height="12" />
      </button>
    </section>
  )
}
