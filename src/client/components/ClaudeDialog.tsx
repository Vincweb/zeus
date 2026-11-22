import { useEffect, useRef } from 'react'
import type { HomeInfo } from '../../shared/types'
import { orchestratorPrompt } from '../claudePrompt'
import { ClaudeActions } from './ClaudeActions'
import { Button, SparkIcon } from './ui'

/**
 * Driving the fleet from Claude, explained in a window: what a session opened on this folder can
 * ask Zeus, and the prompt that starts one — opened in the app, filled in and never sent, or
 * copied.
 */
export const ClaudeDialog = ({
  root,
  home,
  onClose,
}: {
  root: string
  home: HomeInfo
  onClose: () => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="claude-title"
      className="m-auto w-[min(600px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-text shadow-lift"
    >
      <div className="p-5">
        <h2 id="claude-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <SparkIcon className="text-accent" />
          Piloter avec Claude
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Ce dossier est branché à Claude Code : son <span className="font-mono">.mcp.json</span>{' '}
          déclare le serveur MCP de Zeus. Une session ouverte ici lui demande où travailler, puis
          ouvre une session dans le repo concerné.
        </p>
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-muted">
          <li>
            <span className="font-medium text-text">Ce qu’il sait</span> — les comptes et leurs
            repos, le chemin de chaque clone, lesquels sont en retard, modifiés ou prêts, la CI, les
            outils en place.
          </li>
          <li>
            <span className="font-medium text-text">Ce qu’il fait quand tu le lui demandes</span> —
            mettre à jour (avance rapide seulement), cloner, installer un outil.
          </li>
          <li>
            <span className="font-medium text-text">Ce qu’il ne fait pas</span> — analyser un projet
            : pour ça, il travaille dans le repo, avec ses propres outils.
          </li>
        </ul>
        <div className="mt-4 rounded-xl border border-line bg-raised p-4">
          <ClaudeActions root={root} prompt={orchestratorPrompt(home)} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => ref.current?.close()}>Fermer</Button>
        </div>
      </div>
    </dialog>
  )
}
