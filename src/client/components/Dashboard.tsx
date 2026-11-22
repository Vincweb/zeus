import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionResult, RepoStatus, Workspace } from '../../shared/types'
import { CODE_ATLAS, WELCOME_PATH, fleetPath } from '../../shared/routes'
import {
  cloneRepo,
  fetchDetails,
  fetchJournal,
  fetchStatus,
  fetchToolVersions,
  saveAccounts,
  dismissRun,
  saveFollowedRepos,
  stopRun,
  updateRepo,
} from '../api'
import { clock, plural } from '../format'
import {
  countsOf,
  leftOutOf,
  needsUpdate,
  ofWorkspace,
  select,
  withDetails,
  type Filter,
} from '../model'
import { rememberHome } from '../recent'
import { navigate } from '../router'
import { AccountsDialog } from './AccountsDialog'
import { Archived } from './Archived'
import { CloneAllDialog } from './CloneAllDialog'
import { ClaudeDialog } from './ClaudeDialog'
import { CloneDialog } from './CloneDialog'
import { Footer } from './Footer'
import { TerminalSheet } from './TerminalSheet'
import { NextSteps } from './NextSteps'
import { Opening } from './Opening'
import { Orphans } from './Orphans'
import { RepoTable } from './RepoTable'
import { ReposDialog } from './ReposDialog'
import { Summary } from './Summary'
import { Tools } from './Tools'
import {
  ArrowDownIcon,
  BoltIcon,
  Button,
  Link,
  RefreshIcon,
  SearchIcon,
  SparkIcon,
  Spinner,
  TerminalIcon,
  cx,
} from './ui'

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
  // How the installed tools compare with their latest release: npm and GitHub are asked, so it
  // comes once the page is up, and is kept a while.
  // The console: what the server did. Asked again every second while it is open or something
  // runs; otherwise once, and after each action of this page.
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [claudeOpen, setClaudeOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<number | null>(null)
  const [seenUpTo, setSeenUpTo] = useState(0)
  const journal = useQuery({
    queryKey: ['journal'],
    queryFn: fetchJournal,
    enabled: status.isSuccess,
    refetchInterval: (query) =>
      consoleOpen ||
      (query.state.data?.entries ?? []).some(
        (entry) => entry.kind !== 'zeus' && entry.state === 'running',
      )
        ? 1000
        : false,
  })
  const entries = useMemo(() => journal.data?.entries ?? [], [journal.data])
  const lastEntry = entries[0]?.id ?? 0
  // A failure counts until the console has been looked at: open, everything in it is seen.
  const unseenFailures = consoleOpen
    ? 0
    : entries.filter((entry) => entry.state === 'failed' && entry.id > seenUpTo).length
  const toggleConsole = () => {
    setSeenUpTo(lastEntry)
    setConsoleOpen((open) => !open)
  }
  const showRun = (id: number) => {
    setSeenUpTo(lastEntry)
    setSelectedRun(id)
    setConsoleOpen(true)
    void queryClient.invalidateQueries({ queryKey: ['journal'] })
  }
  const stop = (id: number) => {
    void stopRun(id)
      .catch(() => {})
      .finally(() => void queryClient.invalidateQueries({ queryKey: ['journal'] }))
  }
  const dismiss = (id: number | 'finished') => {
    if (id === 'finished' || id === selectedRun) setSelectedRun(null)
    void dismissRun(id)
      .catch(() => {})
      .finally(() => void queryClient.invalidateQueries({ queryKey: ['journal'] }))
  }
  const running = entries.filter((entry) => entry.kind !== 'zeus' && entry.state === 'running')
  // code-atlas started from the page, once it said where it serves: each clone can open in it.
  const atlasUrl =
    running.find((entry) => entry.kind === 'tool' && entry.toolId === CODE_ATLAS && entry.url)
      ?.url ?? null

  const toolVersions = useQuery({
    queryKey: ['tool-versions', root],
    queryFn: () => fetchToolVersions(root),
    enabled: status.isSuccess,
    staleTime: 10 * 60 * 1000,
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
  const [choosingRepos, setChoosingRepos] = useState<Workspace | null>(null)
  const [savingRepos, setSavingRepos] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)
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
  // What GitHub lists in the accounts shown that this root leaves out, so a partly followed
  // organization is not read as the whole of it.
  const leftOut = (account ? [account] : accounts).reduce((sum, one) => sum + leftOutOf(one), 0)
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
    // What was just done is in the journal: the console and its badge follow.
    void queryClient.invalidateQueries({ queryKey: ['journal'] })
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

  // Only the clones GitHub is ahead of: the others have nothing to bring.
  const late = repos.filter(needsUpdate)
  const updateAll = () =>
    runAll('Mise à jour', late, PARALLEL_UPDATES, (repo) => updateRepo(root, repo.id))

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

  const saveRepos = async (login: string, repos: string[]) => {
    setSavingRepos(true)
    setReposError(null)
    try {
      await saveFollowedRepos(root, login, repos)
      setChoosingRepos(null)
      await refresh()
    } catch (error) {
      setReposError(error instanceof Error ? error.message : 'la requête a échoué')
    } finally {
      setSavingRepos(false)
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

  const { home, workspaces, orphans, tools, warnings, archived, generatedAt } = status.data
  // Like the table, the archived of the account in the tab — of every account under « Tous ».
  const archivedHere = account
    ? archived.filter((repo) => repo.workspace === account.login)
    : archived
  const select_ = (login: string | null) => {
    setFilter('all')
    navigate(fleetPath(root, login), { replace: true })
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-5 pb-10 sm:px-6">
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
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="text-[12px] text-faint" aria-live="polite">
            {bulk ? `${bulk.label} ${bulk.done}/${bulk.total}…` : `Lu à ${clock(generatedAt)}`}
          </span>
          <Button
            onClick={toggleConsole}
            aria-expanded={consoleOpen}
            title="Ce que le serveur de Zeus a lancé — clones, mises à jour, installations, outils — et ce qu’il a répondu"
          >
            <TerminalIcon />
            Terminal
            {running.length > 0 && (
              <span className="inline-flex items-center gap-1 text-info">
                <Spinner className="size-3" />
                {running.length}
              </span>
            )}
            {unseenFailures > 0 && (
              <span
                className="rounded-full bg-danger-soft px-1.5 text-[11px] text-danger"
                title={`${unseenFailures} en échec depuis la dernière fois`}
              >
                {unseenFailures}
              </span>
            )}
          </Button>
          <Button busy={status.isFetching && !bulk} onClick={() => void refresh(true)}>
            {!(status.isFetching && !bulk) && <RefreshIcon />}
            Actualiser
          </Button>
          {home.claude.connected && (
            <Button
              variant="primary"
              onClick={() => setClaudeOpen(true)}
              title="Ce qu’une session Claude Code ouverte ici sait de la flotte, et le prompt qui la lance"
            >
              <SparkIcon />
              Piloter avec Claude
            </Button>
          )}
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
        {single && (
          <button
            type="button"
            onClick={() => {
              setReposError(null)
              setChoosingRepos(single)
            }}
            className="text-[12px] text-accent hover:underline"
          >
            Repos suivis…
          </button>
        )}
      </div>

      <div className="mt-4">
        <Summary counts={counts} filter={filter} onFilter={setFilter} />
      </div>

      {tools.length > 0 && (
        <div className="mt-4">
          <Tools
            root={root}
            tools={tools}
            names={names}
            terminal={home.terminal}
            versions={toolVersions.data?.versions ?? {}}
            onInstalled={() => {
              void refresh()
              void queryClient.invalidateQueries({ queryKey: ['tool-versions', root] })
            }}
            runs={entries}
            onStarted={showRun}
            onShow={showRun}
            onStop={stop}
          />
        </div>
      )}

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
          {archivedHere.length > 0 &&
            ` · ${plural(archivedHere.length, 'archivé masqué', 'archivés masqués')}`}
          {leftOut > 0 && ` · ${plural(leftOut, 'non suivi', 'non suivis')}`}
        </span>
        {details.isFetching && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-faint" role="status">
            <Spinner /> CI et PR de {plural(pending, 'repo', 'repos')} en cours de lecture…
          </span>
        )}
        <span className="ml-auto">
          <Button
            variant={late.length > 0 ? 'primary' : 'ghost'}
            busy={bulk !== null}
            disabled={late.length === 0}
            onClick={() => void updateAll()}
            title={
              late.length > 0
                ? `git fetch sur les ${plural(late.length, 'clone', 'clones')} en retard, puis avance rapide là où rien ne s’y oppose. Jamais de merge.`
                : 'Rien à mettre à jour : aucun clone en vue n’est en retard sur GitHub'
            }
          >
            {bulk === null && <ArrowDownIcon />}
            Tout mettre à jour{late.length > 0 && ` (${late.length})`}
          </Button>
        </span>
      </div>

      <div className="mt-3">
        <RepoTable
          repos={shown}
          accounts={account === null && accounts.length > 1 ? accounts : []}
          atlasUrl={atlasUrl}
          busy={busy}
          results={results}
          onClone={setCloning}
          onUpdate={(repo) => void update(repo)}
        />
      </div>

      <div className="mt-8 flex flex-col gap-6 empty:hidden">
        <Orphans orphans={orphans} />
        <Archived
          archived={archivedHere}
          accounts={account === null && accounts.length > 1 ? accounts : []}
        />
      </div>

      <Footer version={home.version} />

      {claudeOpen && <ClaudeDialog root={root} home={home} onClose={() => setClaudeOpen(false)} />}

      {consoleOpen && (
        <TerminalSheet
          entries={entries}
          selected={selectedRun}
          onSelect={setSelectedRun}
          onStop={stop}
          onDismiss={dismiss}
          onClose={() => setConsoleOpen(false)}
        />
      )}

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

      {choosingRepos && (
        <ReposDialog
          key={choosingRepos.login}
          account={choosingRepos}
          saving={savingRepos}
          error={reposError}
          onCancel={() => setChoosingRepos(null)}
          onSave={(repos) => void saveRepos(choosingRepos.login, repos)}
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
