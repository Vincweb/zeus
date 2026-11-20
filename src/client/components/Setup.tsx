import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState, type ReactNode } from 'react'
import type { MachineCheck, Owner } from '../../shared/types'
import { WELCOME_PATH, fleetPath } from '../../shared/routes'
import { createHome, fetchHomes, fetchMachine, fetchOwners, fetchTarget } from '../api'
import { plural } from '../format'
import { navigate } from '../router'
import {
  Badge,
  BoltIcon,
  Button,
  CheckIcon,
  Command,
  CrossIcon,
  DownloadIcon,
  Link,
  RefreshIcon,
  Spinner,
  cx,
} from './ui'

const messageOf = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'la requête a échoué'

/** One numbered stage of the set-up, with what it has to say and whether it is settled. */
const Step = ({
  index,
  title,
  done,
  muted = false,
  children,
}: {
  index: number
  title: string
  done: boolean
  /** A stage that cannot be worked on yet, because an earlier one is not settled. */
  muted?: boolean
  children: ReactNode
}) => (
  <section
    aria-labelledby={`step-${index}`}
    className={cx('rounded-xl border border-line bg-panel p-5 shadow-card', muted && 'opacity-55')}
  >
    <div className="flex items-center gap-3">
      <span
        className={cx(
          'grid size-7 shrink-0 place-content-center rounded-full text-[13px] font-semibold',
          done ? 'bg-ok-soft text-ok' : 'bg-accent-fill text-on-accent',
        )}
      >
        {done ? <CheckIcon /> : index}
      </span>
      <h2 id={`step-${index}`} className="text-[15px] font-semibold tracking-tight">
        {title}
      </h2>
    </div>
    <div className="mt-3 sm:pl-10">{children}</div>
  </section>
)

/** One thing the machine has or lacks, and what to do when it lacks it. */
const Check = ({
  ok,
  label,
  detail,
  children,
}: {
  ok: boolean
  label: string
  detail: string
  children?: ReactNode
}) => (
  <li className="py-2">
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span
        className={cx(
          'grid size-5 shrink-0 place-content-center rounded-full',
          ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger',
        )}
      >
        {ok ? <CheckIcon width="11" height="11" /> : <CrossIcon width="11" height="11" />}
      </span>
      <span className="text-[13px] font-medium">{label}</span>
      <span className="text-[12.5px] text-muted">{detail}</span>
    </div>
    {!ok && children && <div className="mt-1.5 sm:pl-[30px]">{children}</div>}
  </li>
)

const installHint = (platform: string, tool: 'git' | 'gh') =>
  platform === 'darwin'
    ? `brew install ${tool}`
    : tool === 'gh'
      ? 'voir https://cli.github.com pour ton système'
      : 'voir https://git-scm.com/downloads pour ton système'

const Machine = ({ machine }: { machine: MachineCheck }) => (
  <ul className="m-0 list-none divide-y divide-line-soft p-0">
    <Check
      ok={machine.git.ok}
      label="git"
      detail={machine.git.ok ? `version ${machine.git.version ?? 'inconnue'}` : 'introuvable'}
    >
      <Command command={installHint(machine.platform, 'git')} />
    </Check>
    <Check
      ok={machine.gh.ok}
      label="GitHub CLI (gh)"
      detail={
        machine.gh.ok
          ? `version ${machine.gh.version ?? 'inconnue'}`
          : 'introuvable — Zeus lit GitHub à travers lui'
      }
    >
      <Command command={installHint(machine.platform, 'gh')} />
    </Check>
    <Check
      ok={machine.login !== null}
      label="Compte GitHub"
      detail={
        machine.login !== null
          ? `connecté en tant que ${machine.login}`
          : machine.gh.ok
            ? 'pas connecté'
            : 'à vérifier une fois gh installé'
      }
    >
      {machine.gh.ok && (
        <>
          <p className="text-[12.5px] text-muted">
            Lance cette commande dans un terminal, réponds à ses questions, puis reviens vérifier.
            Zeus ne te connecte pas lui-même : il ne voit jamais ton mot de passe ni ton jeton.
          </p>
          <Command command="gh auth login" />
          {machine.loginError && (
            <p className="mt-1.5 text-[11.5px] text-faint">
              Ce que dit gh : <span className="font-mono">{machine.loginError}</span>
            </p>
          )}
        </>
      )}
    </Check>
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2">
      <span className="grid size-5 shrink-0 place-content-center rounded-full bg-info-soft text-info">
        <DownloadIcon width="11" height="11" />
      </span>
      <span className="text-[13px] font-medium">Clones</span>
      <span className="text-[12.5px] text-muted">
        {machine.ssh
          ? 'en SSH : ta clé est reconnue par GitHub'
          : 'en HTTPS, avec la connexion de gh : aucune clé SSH reconnue par GitHub ici'}
      </span>
    </li>
  </ul>
)

/**
 * Setting Zeus up, on a machine that may never have seen it. There is one thing to choose — the
 * parent folder of the projects — and nothing to list: the accounts come from `gh`, the
 * repositories from GitHub, the clones from a scan. Nothing is created before the last button.
 */
export const Setup = ({ dir: asked }: { dir: string }) => {
  const queryClient = useQueryClient()
  const machine = useQuery({ queryKey: ['machine'], queryFn: fetchMachine })
  const ready = machine.data?.git.ok === true && machine.data.login !== null

  const owners = useQuery({ queryKey: ['owners'], queryFn: fetchOwners, enabled: ready })
  const here = useQuery({ queryKey: ['homes', ''], queryFn: () => fetchHomes([]) })

  // Until a folder is typed, the one Zeus was started in stands: it is where the command was run.
  const [typed, setDir] = useState<string | null>(asked === '' ? null : asked)
  const dir = typed ?? here.data?.here.dir ?? ''
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deferredDir = useDeferredValue(dir.trim())
  const target = useQuery({
    queryKey: ['target', deferredDir],
    queryFn: () => fetchTarget(deferredDir),
    enabled: deferredDir !== '',
    placeholderData: (previous) => previous,
  })

  const list: Owner[] = owners.data?.owners ?? []
  const toggle = (login: string) => {
    const next = new Set(left)
    if (next.has(login)) next.delete(login)
    else next.add(login)
    setLeft(next)
  }

  const place = target.data
  const taken = place !== undefined && (place.isHome || place.insideHome !== null)
  const canCreate = ready && place !== undefined && !taken && dir.trim() !== '' && !working

  const create = async () => {
    setWorking(true)
    setError(null)
    try {
      const created = await createHome({ dir: dir.trim(), hidden: [...left] })
      await queryClient.invalidateQueries({ queryKey: ['homes'] })
      navigate(fleetPath(created.root))
    } catch (reason) {
      setError(messageOf(reason))
      setWorking(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 pb-12 sm:px-8">
      <header className="flex items-center gap-3 py-5">
        <Link
          to={WELCOME_PATH}
          aria-label="Accueil"
          className="grid size-8 place-content-center rounded-lg bg-text text-accent-fill"
        >
          <BoltIcon width="18" height="18" />
        </Link>
        <span className="text-[16px] font-semibold tracking-tight">Zeus</span>
        <Link to={WELCOME_PATH} className="ml-auto text-[12.5px] text-accent hover:underline">
          Retour à l’accueil
        </Link>
      </header>

      <div className="pt-4 pb-6">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
          Choisir le dossier de tes projets
        </h1>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted">
          Zeus ne demande qu’une chose : le dossier parent où vivent — ou vivront — tes clones. Tes
          comptes viennent de <span className="font-mono">gh</span>, tes repos de GitHub : il n’y a
          rien à lister ni à classer. Rien n’est créé avant le dernier bouton.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Step index={1} title="Cette machine" done={ready}>
          {machine.isPending ? (
            <div className="flex items-center gap-2 text-muted">
              <Spinner /> Vérification de git, de gh et de ta connexion…
            </div>
          ) : machine.isError ? (
            <p role="alert" className="text-[13px] text-danger">
              {machine.error.message}
            </p>
          ) : (
            <>
              <Machine machine={machine.data} />
              <Button
                className="mt-2"
                busy={machine.isFetching}
                onClick={() => void machine.refetch()}
              >
                {!machine.isFetching && <RefreshIcon />}
                Revérifier
              </Button>
            </>
          )}
        </Step>

        <Step
          index={2}
          title="Le dossier parent"
          done={ready && place !== undefined && !taken}
          muted={!ready}
        >
          <label htmlFor="setup-dir" className="text-[12px] font-medium text-muted">
            Là où sont tes projets — les clones existants y sont retrouvés, les nouveaux y iront
          </label>
          <input
            id="setup-dir"
            value={dir}
            onChange={(event) => setDir(event.target.value)}
            placeholder="~/Documents/Programmation"
            spellCheck={false}
            autoComplete="off"
            className="mt-1 h-8 w-full rounded-md border border-line bg-panel px-2.5 font-mono text-[12.5px] text-text placeholder:text-faint"
          />
          <p className="mt-1.5 text-[12.5px] break-words text-muted" aria-live="polite">
            {place === undefined ? (
              'Le dossier où Zeus a été lancé est proposé par défaut.'
            ) : place.isHome ? (
              <>
                Zeus suit déjà ce dossier.{' '}
                <Link to={fleetPath(place.dir)} className="font-medium text-accent hover:underline">
                  L’ouvrir
                </Link>
              </>
            ) : place.insideHome !== null ? (
              <>
                Ce dossier est déjà dans une flotte que Zeus suit.{' '}
                <Link
                  to={fleetPath(place.insideHome)}
                  className="font-medium text-accent hover:underline"
                >
                  Ouvrir celle-ci
                </Link>
              </>
            ) : !place.exists ? (
              <>
                <span className="font-mono">{place.label}</span> n’existe pas encore : il sera créé.
              </>
            ) : place.clones > 0 ? (
              <>
                {plural(place.clones, 'dossier git trouvé', 'dossiers git trouvés')} sous{' '}
                <span className="font-mono">{place.label}</span>. Rien n’est déplacé : Zeus y ajoute
                seulement un dossier <span className="font-mono">.zeus/</span>.
              </>
            ) : (
              <>
                Aucun dossier git sous <span className="font-mono">{place.label}</span> pour
                l’instant : tes repos seront à cloner. Zeus y ajoute seulement un dossier{' '}
                <span className="font-mono">.zeus/</span>.
              </>
            )}
          </p>
        </Step>

        <Step index={3} title="Tes comptes" done={ready && list.length > 0} muted={!ready}>
          {!ready ? (
            <p className="text-[13px] text-muted">Une fois git et ton compte GitHub en place.</p>
          ) : owners.isPending ? (
            <div className="flex items-center gap-2 text-muted">
              <Spinner /> Lecture de tes comptes…
            </div>
          ) : owners.isError || list.length === 0 ? (
            <p role="alert" className="text-[13px] text-danger">
              {owners.error?.message ?? owners.data?.error ?? 'aucun compte trouvé'}
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-muted">
                Chaque compte GitHub est un workspace : un repo est dans celui du compte qui le
                possède, et un nouveau clone va dans un dossier à son nom. Décoche un compte pour le
                laisser de côté ; tu pourras y revenir.
              </p>
              <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0">
                {list.map((owner) => (
                  <li key={owner.login}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:bg-raised">
                      <input
                        type="checkbox"
                        checked={!left.has(owner.login)}
                        onChange={() => toggle(owner.login)}
                        className="size-4 accent-[var(--color-accent-fill)]"
                      />
                      <span className="text-[13.5px] font-medium">{owner.login}</span>
                      <Badge>{owner.kind === 'user' ? 'Ton compte' : 'Organisation'}</Badge>
                    </label>
                  </li>
                ))}
              </ul>
              {owners.data?.error && (
                <p className="mt-2 text-[12px] text-warn">{owners.data.error}</p>
              )}
            </>
          )}
        </Step>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="primary"
            className="h-9 px-4 text-[13.5px]"
            disabled={!canCreate}
            busy={working}
            onClick={() => void create()}
          >
            Suivre ce dossier
          </Button>
          <span className="text-[12.5px] text-muted">
            {canCreate
              ? `Crée ${place?.label ?? 'ce dossier'}/.zeus/, puis ouvre ta flotte.`
              : !ready
                ? 'Il reste une vérification à régler à l’étape 1.'
                : taken
                  ? 'Ce dossier est déjà suivi : ouvre-le.'
                  : 'Indique le dossier parent de tes projets.'}
          </span>
        </div>
      </div>
    </div>
  )
}
