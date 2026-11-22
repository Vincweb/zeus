import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../shared/types'
import { Badge, Button } from './ui'

/**
 * Which accounts this root follows. Every account `gh` can see is a workspace by default; this
 * only leaves some out — a large organization that is noise here, say. With the repositories
 * followed of each (`ReposDialog`), what about a fleet is a choice rather than a fact, and so what
 * `.zeus/` remembers.
 */
export const AccountsDialog = ({
  accounts,
  saving,
  error,
  onCancel,
  onSave,
}: {
  accounts: Workspace[]
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (hidden: string[]) => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(
    new Set(accounts.filter((account) => account.hidden).map((account) => account.login)),
  )
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  const toggle = (login: string) => {
    const next = new Set(hidden)
    if (next.has(login)) next.delete(login)
    else next.add(login)
    setHidden(next)
  }

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-text shadow-lift"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onSave([...hidden])
        }}
        className="p-5"
      >
        <h2 className="text-[15px] font-semibold">Comptes suivis</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Chaque compte GitHub que ton <span className="font-mono">gh</span> voit est un workspace.
          Décoche ceux que tu ne veux pas dans ce dossier.
        </p>
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
          {accounts.map((account) => (
            <li key={account.login}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:bg-raised">
                <input
                  type="checkbox"
                  checked={!hidden.has(account.login)}
                  onChange={() => toggle(account.login)}
                  className="size-4 accent-[var(--color-accent-fill)]"
                />
                <span className="text-[13.5px] font-medium">{account.login}</span>
                <Badge>{account.kind === 'user' ? 'Ton compte' : 'Organisation'}</Badge>
              </label>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-[12.5px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Annuler</Button>
          <Button variant="primary" type="submit" busy={saving}>
            Enregistrer
          </Button>
        </div>
      </form>
    </dialog>
  )
}
