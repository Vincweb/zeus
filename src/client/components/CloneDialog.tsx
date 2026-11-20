import { useEffect, useRef, useState } from 'react'
import type { HomeInfo, RepoStatus, Workspace } from '../../shared/types'
import { Button, DownloadIcon } from './ui'

/**
 * Where a new clone goes. By default the folder of the account that owns the repository — GitHub's
 * own organization, mirrored on the disk — and otherwise the root, a folder that already holds
 * clones, or a new one. The server has the last word on what a folder name may be.
 */
export const CloneDialog = ({
  repo,
  home,
  accounts,
  onCancel,
  onConfirm,
}: {
  repo: RepoStatus
  home: HomeInfo
  accounts: Workspace[]
  onCancel: () => void
  onConfirm: (folder: string) => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  const account = accounts.find((candidate) => candidate.login === repo.workspace)
  const [folder, setFolder] = useState(account?.folder ?? repo.workspace)
  const suggestions = [
    ...new Set([...accounts.map((candidate) => candidate.folder), ...home.folders]),
  ]
    .filter((candidate) => candidate !== '')
    .sort((a, b) => a.localeCompare(b, 'fr'))
  const clean = folder.split('/').filter(Boolean).join('/')

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-text shadow-lift"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(clean)
        }}
        className="p-5"
      >
        <h2 className="text-[15px] font-semibold">Cloner {repo.remote.name}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Depuis GitHub, sous <span className="font-mono">{home.name}/</span>. Par défaut dans le
          dossier de son compte, comme sur GitHub.
        </p>
        <label className="mt-4 block text-[12px] font-medium text-muted" htmlFor="clone-folder">
          Dossier de destination, sous {home.name}/
        </label>
        <input
          id="clone-folder"
          list="clone-folders"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
          placeholder="(racine)"
          spellCheck={false}
          autoComplete="off"
          className="mt-1 h-8 w-full rounded-md border border-line bg-panel px-2 font-mono text-[12.5px] text-text placeholder:text-faint"
        />
        <datalist id="clone-folders">
          {suggestions.map((candidate) => (
            <option key={candidate} value={candidate} />
          ))}
        </datalist>
        <p className="mt-1.5 text-[12px] text-faint">
          Vide pour la racine. Un dossier qui n’existe pas encore est créé.
        </p>
        <p className="mt-2 font-mono text-[12px] text-muted">
          → {home.name}/{clean === '' ? '' : `${clean}/`}
          {repo.remote.name}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Annuler</Button>
          <Button variant="primary" type="submit">
            <DownloadIcon />
            Cloner
          </Button>
        </div>
      </form>
    </dialog>
  )
}
