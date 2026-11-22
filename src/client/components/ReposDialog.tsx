import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../shared/types'
import { plural } from '../format'
import { Button, SearchIcon } from './ui'

/**
 * Which repositories of an account this root follows. Every one by default, those to come
 * included; ticking only some leaves the others out — one project of a large organization, say.
 * Ticking them all goes back to following the whole account.
 */
export const ReposDialog = ({
  account,
  saving,
  error,
  onCancel,
  onSave,
}: {
  account: Workspace
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (repos: string[]) => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  const [followed, setFollowed] = useState<ReadonlySet<string>>(
    () => new Set(account.followedRepos ?? account.repoNames),
  )
  const [search, setSearch] = useState('')
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = account.repoNames.filter((name) =>
    words.every((word) => name.toLowerCase().includes(word)),
  )
  const count = account.repoNames.filter((name) => followed.has(name)).length
  const toggle = (name: string) => {
    const next = new Set(followed)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setFollowed(next)
  }

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-text shadow-lift"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onSave([...followed])
        }}
        className="p-5"
      >
        <h2 className="text-[15px] font-semibold">Repos suivis de {account.login}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Tout coché, Zeus suit le compte entier, repos à venir compris. Sinon, seulement ceux que
          tu coches : les autres sortent du tableau, des actions et des réponses à Claude.
        </p>

        {account.repoNames.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-muted">
            GitHub n’a rien listé pour {account.login}.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">Chercher un repo</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  // Enter narrows the list; it must not save the choice half made.
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                  placeholder="Chercher un repo…"
                  className="h-8 w-full rounded-md border border-line bg-panel pr-2 pl-8 text-[12.5px] text-text placeholder:text-faint"
                />
              </label>
              <Button onClick={() => setFollowed(new Set(account.repoNames))}>Tout cocher</Button>
              <Button onClick={() => setFollowed(new Set())}>Tout décocher</Button>
            </div>
            <p className="mt-2 text-[12px] text-muted" role="status">
              {count === account.repoNames.length
                ? `Tous suivis : ${plural(count, 'repo', 'repos')}`
                : `${count} suivi${count > 1 ? 's' : ''} sur ${plural(account.repoNames.length, 'repo', 'repos')}`}
            </p>
            <ul className="m-0 mt-2 max-h-[min(50vh,360px)] list-none overflow-y-auto rounded-lg border border-line p-1">
              {shown.map((name) => (
                <li key={name}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-raised">
                    <input
                      type="checkbox"
                      checked={followed.has(name)}
                      onChange={() => toggle(name)}
                      className="size-4 accent-[var(--color-accent-fill)]"
                    />
                    <span className="text-[13px]">{name}</span>
                  </label>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="px-2.5 py-1.5 text-[12.5px] text-muted">
                  Aucun repo ne correspond.
                </li>
              )}
            </ul>
            {count === 0 && (
              <p className="mt-2 text-[12px] text-muted">
                Coche au moins un repo. Pour ne rien suivre de {account.login}, décoche le compte
                dans « Comptes suivis ».
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[12.5px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Annuler</Button>
          <Button variant="primary" type="submit" busy={saving} disabled={count === 0}>
            Enregistrer
          </Button>
        </div>
      </form>
    </dialog>
  )
}
