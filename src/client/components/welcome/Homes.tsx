import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import type { HomeCandidate } from '../../../shared/types'
import { fleetPath, setupPath } from '../../../shared/routes'
import { checkHome, fetchHomes } from '../../api'
import { ago, plural } from '../../format'
import { forgetHome, useRecentHomes, type RecentHome } from '../../recent'
import { navigate } from '../../router'
import { ArrowRightIcon, Badge, Button, CloseIcon, FolderIcon, Link, Spinner, cx } from '../ui'

type Entry = { candidate: HomeCandidate; recent: RecentHome | undefined }

/** The launch root first, then the ones opened most recently, then the rest by name. */
const order = (a: Entry, b: Entry) =>
  Number(b.candidate.isLaunch) - Number(a.candidate.isLaunch) ||
  (b.recent?.openedAt ?? '').localeCompare(a.recent?.openedAt ?? '') ||
  a.candidate.label.localeCompare(b.candidate.label, 'fr')

const Card = ({ candidate, recent }: Entry) => {
  const broken = candidate.error !== null
  const accounts = recent?.accounts ?? []
  const body = (
    <>
      <div className="flex items-start gap-3 pr-6">
        <span
          aria-hidden="true"
          className={cx(
            'grid size-10 shrink-0 place-content-center rounded-lg',
            broken ? 'bg-line-soft text-faint' : 'bg-accent-soft text-accent',
          )}
        >
          <FolderIcon width="18" height="18" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-semibold">{candidate.name}</span>
            {candidate.isLaunch && <Badge tone="accent">Lancé ici</Badge>}
            {recent && !candidate.isLaunch && <Badge>Ouvert {ago(recent.openedAt)}</Badge>}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">
            {candidate.label}
          </div>
        </div>
      </div>
      {accounts.length > 0 && (
        <div className="mt-3 text-[12.5px] text-muted">
          {plural(accounts.length, 'workspace', 'workspaces')} :{' '}
          <span className="font-medium text-text">{accounts.join(', ')}</span>
        </div>
      )}
      {broken && <p className="mt-2 text-[12px] text-danger">{candidate.error}</p>}
    </>
  )
  return (
    <li className="group relative">
      {broken ? (
        <div className="h-full rounded-xl border border-dashed border-line bg-panel p-4 opacity-90">
          {body}
        </div>
      ) : (
        <Link
          to={fleetPath(candidate.root)}
          className="block h-full rounded-xl border border-line bg-panel p-4 shadow-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-accent-fill hover:shadow-lift"
        >
          {body}
          <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent">
            Ouvrir <ArrowRightIcon width="12" height="12" />
          </span>
        </Link>
      )}
      {recent && !candidate.isLaunch && (
        <button
          type="button"
          onClick={() => forgetHome(candidate.root)}
          title="Oublier ce dossier — rien n’est supprimé sur le disque"
          aria-label={`Oublier le dossier ${candidate.name}`}
          className={cx(
            'absolute top-2.5 right-2.5 grid size-6 place-content-center rounded-md text-faint hover:bg-line-soft hover:text-text',
            !broken && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <CloseIcon width="12" height="12" />
        </button>
      )}
    </li>
  )
}

/** A typed path, checked by the server before the page goes there. */
const OpenByPath = () => {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setChecking(true)
    setError(null)
    checkHome(value)
      .then((candidate) => navigate(fleetPath(candidate.root)))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'la vérification a échoué'),
      )
      .finally(() => setChecking(false))
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="home-path" className="text-[12px] font-medium text-muted">
        Ouvrir un autre dossier
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="home-path"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="~/Documents/Programmation"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby="home-path-help"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 font-mono text-[12.5px] text-text placeholder:text-faint"
        />
        <Button
          variant="primary"
          type="submit"
          busy={checking}
          className="h-8"
          disabled={value.trim() === ''}
        >
          Ouvrir
        </Button>
      </div>
      <p
        id="home-path-help"
        className={cx('mt-1.5 text-[12px]', error ? 'text-danger' : 'text-faint')}
      >
        {error ?? 'Un dossier que Zeus suit déjà, ou n’importe quel dossier à l’intérieur.'}
      </p>
    </form>
  )
}

/**
 * The way in: the folder Zeus was started in, the ones this browser opened before, and a field
 * for any other.
 */
export const Homes = () => {
  const recents = useRecentHomes()
  const remembered = recents.map((recent) => recent.root)
  const homes = useQuery({
    queryKey: ['homes', remembered.join('\n')],
    queryFn: () => fetchHomes(remembered),
    // Forgetting one re-asks with a shorter list: keep the cards on screen meanwhile.
    placeholderData: (previous) => previous,
  })

  const here = homes.data?.here
  const entries = (homes.data?.candidates ?? [])
    .map((candidate): Entry => ({
      candidate,
      recent: recents.find((recent) => recent.root === candidate.root),
    }))
    // A remembered folder that is gone stays until forgotten; a forgotten one leaves at once.
    .filter(({ candidate, recent }) => candidate.error === null || recent !== undefined)
    .sort(order)

  return (
    <section
      id="dossiers"
      aria-labelledby="homes-title"
      className="scroll-mt-6 rounded-2xl border border-line bg-raised p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="homes-title" className="text-[20px] font-semibold tracking-tight">
          Tes dossiers de projets
        </h2>
        <p className="text-[12.5px] text-muted">
          Un dossier parent, tes comptes GitHub dedans : un workspace par compte.
        </p>
      </div>

      {here && homes.data?.launch === null && !here.isHome && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-accent-fill bg-accent-soft px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">Zeus ne suit pas encore ce dossier</div>
            <div className="mt-0.5 truncate font-mono text-[12px] text-muted">{here.label}</div>
            {here.clones > 0 && (
              <div className="mt-0.5 text-[12.5px] text-muted">
                {plural(here.clones, 'dossier git trouvé', 'dossiers git trouvés')} dedans.
              </div>
            )}
          </div>
          <Link
            to={setupPath(here.dir)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-fill px-3.5 text-[13px] font-medium text-on-accent hover:brightness-105"
          >
            Le suivre <ArrowRightIcon width="12" height="12" />
          </Link>
        </div>
      )}

      {homes.isPending ? (
        <div className="mt-4 flex items-center gap-2 text-muted">
          <Spinner /> Recherche des dossiers…
        </div>
      ) : homes.isError ? (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {homes.error.message}
        </p>
      ) : entries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-panel px-5 py-6 text-[13px] text-muted">
          Aucun dossier suivi pour l’instant. Choisis le dossier parent de tes projets, ou ouvre-en
          un par son chemin.
        </div>
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <Card key={entry.candidate.root} {...entry} />
          ))}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line pt-5 md:grid-cols-2">
        <OpenByPath />
        <div>
          <div className="text-[12px] font-medium text-muted">Nouveau dossier</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Zeus vérifie la machine, te demande le dossier parent de tes projets, et retrouve tes
            comptes GitHub tout seul.
          </p>
          <Link
            to={setupPath()}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-3 text-[12.5px] font-medium hover:bg-raised"
          >
            Choisir un dossier <ArrowRightIcon width="12" height="12" />
          </Link>
        </div>
      </div>
    </section>
  )
}
