import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionResult, RepoStatus } from '../../shared/types'
import { WELCOME_PATH, fleetPath } from '../../shared/routes'
import { cloneRepo, fetchDetails, fetchStatus, saveAccounts, updateRepo } from '../api'
import { orchestratorPrompt } from '../claudePrompt'
import { clock, plural } from '../format'
import { countsOf, ofWorkspace, select, withDetails, type Filter } from '../model'
import { rememberHome } from '../recent'
import { navigate } from '../router'
import { AccountsDialog } from './AccountsDialog'
import { ClaudeActions } from './ClaudeActions'
import { CloneAllDialog } from './CloneAllDialog'
import { CloneDialog } from './CloneDialog'
import { NextSteps } from './NextSteps'
import { Opening } from './Opening'
import { Orphans } from './Orphans'
import { RepoTable } from './RepoTable'
import { Summary } from './Summary'
import { Tools } from './Tools'
import { ArrowDownIcon, BoltIcon, Button, Link, RefreshIcon, SearchIcon, Spinner, cx } from './ui'

/** How many clones are fetched at once by « Tout mettre à jour ». */
const PARALLEL_UPDATES = 4

/** How many repositories are cloned at once by « Tout cloner » — each is a full download. */
const PARALLEL_CLONES = 3

const failure = (id: string, error: unknown): ActionResult => ({
  id,
  ok: false,
  outcome: 'failed',
  message: error instanceof Error ? error.message : 'la requête a échoué',
})

const Tab = ({
  active,
  label,
  detail,
  count,
  onSelect,
}: {
  active: boolean
  label: string
  detail?: string
  count: number
  onSelect: () => void
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onSelect}
    className={cx(
      'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] whitespace-nowrap transition-colors',
      active
        ? 'border-accent-fill bg-accent-soft font-semibold text-text'
        : 'border-line bg-panel text-muted hover:bg-raised hover:text-text',
    )}
  >
    {label}
    {detail && <span className="font-normal text-faint">· {detail}</span>}
    <span className={cx('tabular-nums', active ? 'text-accent' : 'text-faint')}>{count}</span>
  </button>
)

/**
 * One parent folder: its workspaces — one per GitHub account —, their repositories, what can be
 * done to them, the tools and the stray folders. `workspace` is the account in view, from the URL.
 */
export const Dashboard = ({ root, workspace }: { root: string; workspace: string | null }) => {
  const queryClient = useQueryClient()
  // The first read and « Actualiser » ask GitHub again; the re-read after an action does not.
  const fresh = useRef(true)
  const status = useQuery({
    queryKey: ['status', root],
    queryFn: () => {
      const askGitHub = fresh.current
      fresh.current = false
      return fetchStatus(root, askGitHub)
    },
  })
  // A large account is listed first and detailed after: its CI and counts arrive here.
  const pending = status.data?.pendingDetails ?? 0
  const details = useQuery({
    queryKey: ['details', root, status.data?.generatedAt],
    queryFn: () => fetchDetails(root),
    enabled: pending > 0,
    staleTime: Infinity,
  })

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [results, setResults] = useState<Readonly<Record<string, ActionResult>>>({})
  const [cloning, setCloning] = useState<RepoStatus | null>(null)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [editingAccounts, setEditingAccounts] = useState(false)
  const [savingAccounts, setSavingAccounts] = useState(false)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null)

  const all = useMemo(
    () => withDetails(status.data?.repos ?? [], details.data?.details),
    [status.data, details.data],
  )
  const accounts = useMemo(
    () => (status.data?.workspaces ?? []).filter((account) => !account.hidden),
    [status.data],
  )
  // An account the URL names but the fleet does not hold falls back to everything.
  const account = accounts.find((candidate) => candidate.login === workspace) ?? null
  const single = account ?? (accounts.length === 1 ? (accounts[0] ?? null) : null)

  const repos = useMemo(() => ofWorkspace(all, account?.login ?? null), [all, account])
  const counts = useMemo(() => countsOf(repos), [repos])
  const shown = useMemo(() => select(repos, filter, search), [repos, filter, search])
  const missing = useMemo(() => repos.filter((repo) => repo.local === null), [repos])
  const names = useMemo(() => new Map(all.map((repo) => [repo.id, repo.remote.name])), [all])

  // A root that opened is one worth offering again on the welcome page.
  const name = status.data?.home.name
  const logins = accounts.map((candidate) => candidate.login).join(',')
  useEffect(() => {
    if (name !== undefined)
      rememberHome({ root, name, accounts: logins.split(',').filter(Boolean) })
  }, [root, name, logins])

  /** Runs one action on one repository, and keeps what it answered next to its row. */
  const run = async (id: string, action: () => Promise<ActionResult>) => {
    setBusy((current) => new Set(current).add(id))
    const result = await action().catch((error: unknown) => failure(id, error))
    setResults((current) => ({ ...current, [id]: result }))
    setBusy((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const refresh = (askGitHub = false) => {
    fresh.current = askGitHub
    return queryClient.invalidateQueries({ queryKey: ['status', root] })
  }

  const update = async (repo: RepoStatus) => {
    await run(repo.id, () => updateRepo(root, repo.id))
    await refresh()
  }

  const clone = async (repo: RepoStatus, folder: string) => {
    setCloning(null)
    await run(repo.id, () => cloneRepo(root, repo.id, folder))
    await refresh()
  }

  /** The same action on many repositories, a few at a time, each result landing on its own row. */
  const runAll = async (
    label: string,
    targets: RepoStatus[],
    parallel: number,
    action: (repo: RepoStatus) => Promise<ActionResult>,
  ) => {
    const queue = [...targets]
    setBulk({ label, done: 0, total: queue.length })
    const worker = async () => {
      for (let repo = queue.shift(); repo; repo = queue.shift()) {
        const target = repo
        await run(target.id, () => action(target))
        setBulk((current) => current && { ...current, done: current.done + 1 })
      }
    }
    await Promise.all(Array.from({ length: parallel }, worker))
    setBulk(null)
    await refresh()
  }

  const updateAll = () =>
    runAll(
      'Mise à jour',
      repos.filter((repo) => repo.local !== null),
      PARALLEL_UPDATES,
      (repo) => updateRepo(root, repo.id),
    )

  /** Each missing repository goes where the server puts it: the folder of its account. */
  const cloneAll = () => {
    setConfirmingAll(false)
    setFilter('all')
    return runAll('Clonage', missing, PARALLEL_CLONES, (repo) => cloneRepo(root, repo.id, null))
  }

  const saveFollowed = async (hidden: string[]) => {
    setSavingAccounts(true)
    setAccountsError(null)
    try {
      await saveAccounts(root, hidden)
      setEditingAccounts(false)
      if (workspace !== null && hidden.includes(workspace))
        navigate(fleetPath(root), { replace: true })
      await refresh(true)
    } catch (error) {
      setAccountsError(error instanceof Error ? error.message : 'la requête a échoué')
    } finally {
      setSavingAccounts(false)
    }
  }

  if (status.isPending) return <Opening root={root} />

  if (status.isError) {
    return (
      <div className="grid min-h-screen place-content-center px-6">
        <div className="max-w-lg rounded-xl border border-line bg-panel p-5 shadow-card">
          <h1 className="text-[15px] font-semibold">Zeus n’a pas pu lire ce dossier</h1>
          <p className="mt-1 font-mono text-[12px] break-all text-muted">{root}</p>
          <p className="mt-2 text-[13px] text-danger">{status.error.message}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void refresh(true)}>
              <RefreshIcon /> Réessayer
            </Button>
            <Link
              to={WELCOME_PATH}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium text-accent hover:underline"
            >
              Choisir un autre dossier
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { home, workspaces, orphans, tools, warnings, archivedCount, generatedAt } = status.data
  const select_ = (login: string | null) => {
    setFilter('all')
    navigate(fleetPath(root, login), { replace: true })
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-5 pb-12 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2.5">
          <Link
            to={WELCOME_PATH}
            title="Accueil : choisir un dossier"
            aria-label="Accueil : choisir un dossier"
            className="grid size-8 place-content-center rounded-lg bg-text text-accent-fill"
          >
            <BoltIcon width="18" height="18" />
          </Link>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-[17px] leading-5 font-semibold tracking-tight">{home.name}</h1>
              <Link to={WELCOME_PATH} className="text-[12px] text-accent hover:underline">
                Changer de dossier
              </Link>
            </div>
            <div className="text-[12px] break-all text-muted">
              <span className="font-mono text-[11.5px]">{home.label}</span>
              {home.login && <> · connecté en tant que {home.login}</>}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-faint" aria-live="polite">
            {bulk ? `${bulk.label} ${bulk.done}/${bulk.total}…` : `Lu à ${clock(generatedAt)}`}
          </span>
          <Button busy={status.isFetching && !bulk} onClick={() => void refresh(true)}>
            {!(status.isFetching && !bulk) && <RefreshIcon />}
            Actualiser
          </Button>
          <Button
            variant="primary"
            busy={bulk !== null}
            disabled={counts.cloned === 0}
            onClick={() => void updateAll()}
            title="git fetch sur chaque clone en vue, puis avance rapide là où rien ne s’y oppose. Jamais de merge."
          >
            {bulk === null && <ArrowDownIcon />}
            Tout mettre à jour
          </Button>
        </div>
      </header>

      {warnings.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-warn/40 bg-warn-soft px-4 py-2.5 text-[12.5px] text-warn"
        >
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      )}

      <div
        className="mt-5 flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="Workspaces"
      >
        {accounts.length > 1 && (
          <Tab
            active={account === null}
            label="Tous"
            count={all.length}
            onSelect={() => select_(null)}
          />
        )}
        {accounts.map((candidate) => (
          <Tab
            key={candidate.login}
            active={
              single?.login === candidate.login && (account !== null || accounts.length === 1)
            }
            label={candidate.label}
            detail={candidate.kind === 'user' ? candidate.login : undefined}
            count={ofWorkspace(all, candidate.login).length}
            onSelect={() => select_(candidate.login)}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setAccountsError(null)
            setEditingAccounts(true)
          }}
          className="ml-1 text-[12px] text-accent hover:underline"
        >
          Comptes suivis…
        </button>
      </div>

      <div className="mt-4">
        <Summary counts={counts} filter={filter} onFilter={setFilter} />
      </div>

      <div className="mt-5 empty:hidden">
        <NextSteps
          home={home}
          account={single}
          missing={missing}
          busy={bulk !== null}
          onCloneAll={() => setConfirmingAll(true)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Chercher un repo</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chercher un repo, un langage, un dossier…"
            className="h-8 w-full rounded-md border border-line bg-panel pr-2 pl-8 text-[12.5px] text-text placeholder:text-faint"
          />
        </label>
        <span className="text-[12px] text-muted">
          {shown.length === repos.length
            ? plural(repos.length, 'repo', 'repos')
            : `${shown.length} sur ${plural(repos.length, 'repo', 'repos')}`}
          {archivedCount > 0 && ` · ${plural(archivedCount, 'archivé masqué', 'archivés masqués')}`}
        </span>
        {details.isFetching && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-faint" role="status">
            <Spinner /> CI et PR de {plural(pending, 'repo', 'repos')} en cours de lecture…
          </span>
        )}
      </div>

      <div className="mt-3">
        <RepoTable
          repos={shown}
          accounts={account === null && accounts.length > 1 ? accounts : []}
          busy={busy}
          results={results}
          onClone={setCloning}
          onUpdate={(repo) => void update(repo)}
        />
      </div>

      {tools.length > 0 && (
        <div className="mt-8">
          <Tools root={root} tools={tools} names={names} onInstalled={() => void refresh()} />
        </div>
      )}

      {home.claude.connected && (
        <section className="mt-8" aria-labelledby="claude-title">
          <h2 id="claude-title" className="text-[14px] font-semibold">
            Piloter avec Claude
          </h2>
          <p className="mt-0.5 max-w-[80ch] text-[12.5px] text-muted">
            Ce dossier est branché à Claude Code : une session ouverte ici interroge Zeus pour
            savoir où travailler, puis ouvre une session dans le repo concerné.
          </p>
          <div className="mt-3 rounded-xl border border-line bg-panel p-4 shadow-card">
            <ClaudeActions root={root} prompt={orchestratorPrompt(home)} />
          </div>
        </section>
      )}

      <div className="mt-8">
        <Orphans orphans={orphans} />
      </div>

      <footer className="mt-10 text-[11.5px] text-faint">
        Zeus {__APP_VERSION__} · sert cette machine uniquement · lit GitHub avec ton{' '}
        <span className="font-mono">gh</span>
      </footer>

      {confirmingAll && single && (
        <CloneAllDialog
          home={home}
          account={single}
          missing={missing}
          onCancel={() => setConfirmingAll(false)}
          onConfirm={() => void cloneAll()}
        />
      )}

      {editingAccounts && (
        <AccountsDialog
          accounts={workspaces}
          saving={savingAccounts}
          error={accountsError}
          onCancel={() => setEditingAccounts(false)}
          onSave={(hidden) => void saveFollowed(hidden)}
        />
      )}

      {cloning && (
        <CloneDialog
          key={cloning.id}
          repo={cloning}
          home={home}
          accounts={accounts}
          onCancel={() => setCloning(null)}
          onConfirm={(folder) => void clone(cloning, folder)}
        />
      )}
    </div>
  )
}
