import { useEffect, useRef } from 'react'
import type { HomeInfo, RepoStatus, Workspace } from '../../shared/types'
import { plural } from '../format'
import { Button, DownloadIcon } from './ui'

/** Beyond this many, cloning everything is a download worth a second thought. */
const A_LOT = 25

/**
 * The one confirmation Zeus asks for: cloning everything an account is missing downloads as many
 * repositories at once, so the list and where each one goes are shown before anything starts.
 */
export const CloneAllDialog = ({
  home,
  account,
  missing,
  onCancel,
  onConfirm,
}: {
  home: HomeInfo
  account: Workspace
  missing: RepoStatus[]
  onCancel: () => void
  onConfirm: () => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-text shadow-lift"
    >
      <div className="p-5">
        <h2 className="text-[15px] font-semibold">
          Cloner {plural(missing.length, 'repo', 'repos')} de {account.login}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Depuis GitHub, en{' '}
          {home.cloneProtocol === 'https' ? 'HTTPS avec la connexion de gh' : 'SSH'}, trois à la
          fois, dans{' '}
          <span className="font-mono">
            {home.name}/{account.folder}/
          </span>
          . Un dossier qui existe déjà n’est jamais écrasé : le repo est alors signalé en échec et
          laissé tel quel.
        </p>
        {missing.length > A_LOT && (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            {missing.length} repos, c’est un téléchargement conséquent. Tu peux aussi cloner
            seulement ceux dont tu as besoin, un par un.
          </p>
        )}
        <ul className="m-0 mt-3 max-h-64 list-none divide-y divide-line-soft overflow-y-auto rounded-lg border border-line p-0">
          {missing.map((repo) => (
            <li key={repo.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <span className="text-[13px] font-medium">{repo.remote.name}</span>
              <span className="truncate font-mono text-[11.5px] text-muted">
                {home.name}/{account.folder}/{repo.remote.name}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Annuler</Button>
          <Button variant="primary" onClick={onConfirm}>
            <DownloadIcon />
            Cloner {plural(missing.length, 'repo', 'repos')}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
