import type { ActionResult, CiState, RepoStatus, Workspace } from '../../shared/types'
import { ago, plural } from '../format'
import { groupRepos, needsUpdate, noUpdateBecause } from '../model'
import {
  ArrowDownIcon,
  Badge,
  BranchIcon,
  Button,
  CheckIcon,
  DownloadIcon,
  Language,
  LockIcon,
  cx,
  type Tone,
} from './ui'

const SYNC: Record<RepoStatus['sync'], { label: string; tone: Tone; title: string }> = {
  'not-cloned': {
    label: 'Pas cloné',
    tone: 'neutral',
    title: 'Ce repo n’a pas de clone sous le dossier parent.',
  },
  'up-to-date': { label: 'À jour', tone: 'ok', title: 'Le clone a tout ce que GitHub a.' },
  behind: { label: 'En retard', tone: 'warn', title: 'GitHub a des commits que ce clone n’a pas.' },
  ahead: {
    label: 'À pousser',
    tone: 'info',
    title: 'Ce clone a des commits qui ne sont pas sur GitHub.',
  },
  diverged: {
    label: 'Divergé',
    tone: 'danger',
    title: 'Le clone et GitHub ont chacun des commits que l’autre n’a pas.',
  },
  'no-upstream': {
    label: 'Sans amont',
    tone: 'neutral',
    title: 'La branche courante ne suit aucune branche distante.',
  },
}

const CI: Record<CiState, { label: string; dot: string } | null> = {
  success: { label: 'CI verte', dot: 'bg-ok' },
  failure: { label: 'CI en échec', dot: 'bg-danger' },
  pending: { label: 'CI en cours', dot: 'bg-warn' },
  none: null,
}

const SyncCell = ({ repo }: { repo: RepoStatus }) => {
  const sync = SYNC[repo.sync]
  const local = repo.local
  const counts = [
    local?.behind ? `${local.behind} en retard` : null,
    local?.ahead ? `${local.ahead} en avance` : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={sync.tone} title={sync.title}>
        {sync.label}
        {counts.length > 0 && <span className="font-normal opacity-80">· {counts.join(', ')}</span>}
      </Badge>
      {local !== null && local.dirtyFiles > 0 && (
        <Badge tone="accent" title="Fichiers modifiés ou nouveaux, pas encore commités.">
          {plural(local.dirtyFiles, 'modif', 'modifs')}
        </Badge>
      )}
    </div>
  )
}

/** What GitHub says of a repository — or that it has not said yet, for one still being read. */
const GitHubCell = ({ repo }: { repo: RepoStatus }) => {
  const { remote } = repo
  if (!remote.detailed) {
    return remote.isArchived ? (
      <span className="text-faint">—</span>
    ) : (
      <span className="skeleton block h-3 w-16" title="Lecture de la CI et des PR en cours…" />
    )
  }
  const ci = CI[remote.ci]
  return (
    <div className="flex flex-col gap-0.5 text-[12px] text-muted">
      {ci && (
        <span className="inline-flex items-center gap-1.5">
          <span className={cx('size-2 rounded-full', ci.dot)} />
          {ci.label}
        </span>
      )}
      {remote.openPullRequests > 0 && (
        <a
          href={`${remote.url}/pulls`}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {plural(remote.openPullRequests, 'PR ouverte', 'PR ouvertes')}
        </a>
      )}
      {remote.openIssues > 0 && (
        <a
          href={`${remote.url}/issues`}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {plural(remote.openIssues, 'issue', 'issues')}
        </a>
      )}
      {!ci && remote.openPullRequests === 0 && remote.openIssues === 0 && (
        <span className="text-faint">—</span>
      )}
    </div>
  )
}

/**
 * What code-atlas recorded in a clone: its score, a reference accepted on a given day — not a
 * measure of now — or just that it is set up there.
 */
const AtlasCell = ({ atlas }: { atlas: RepoStatus['atlas'] }) => {
  if (!atlas) return <span className="text-faint">—</span>
  const { score } = atlas
  if (!score) {
    return (
      <span
        className="text-[12px] text-faint"
        title="code-atlas est en place ici, sans score enregistré"
      >
        en place
      </span>
    )
  }
  const tone = score.overall >= 90 ? 'ok' : score.overall >= 70 ? 'warn' : 'danger'
  const families = score.families.map((family) => `${family.family} ${family.score}`).join(' · ')
  const when = score.savedAt ? new Date(score.savedAt).toLocaleDateString('fr') : null
  return (
    <Badge
      tone={tone}
      title={`Score de la référence code-atlas${when ? ` enregistrée le ${when}` : ''}${families ? ` — ${families}` : ''}`}
    >
      {score.overall}
    </Badge>
  )
}

const Row = ({
  repo,
  account,
  atlasColumn,
  busy,
  result,
  onClone,
  onUpdate,
}: {
  repo: RepoStatus
  /** The label of its account, shown when several accounts share the table. */
  account: string | null
  /** The table shows what code-atlas recorded: some repo in view has it. */
  atlasColumn: boolean
  busy: boolean
  result: ActionResult | undefined
  onClone: (repo: RepoStatus) => void
  onUpdate: (repo: RepoStatus) => void
}) => {
  const { remote, local } = repo
  // The last commit of the default branch when GitHub was asked; the last push otherwise.
  const moved = remote.headCommittedAt ?? remote.pushedAt
  return (
    <tr className="border-t border-line-soft align-top">
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <a
            href={remote.url}
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] font-semibold text-text hover:text-accent hover:underline"
          >
            {remote.name}
          </a>
          {remote.isPrivate && (
            <span title="Repo privé" className="text-faint">
              <LockIcon width="12" height="12" />
            </span>
          )}
          {remote.isArchived && <Badge>Archivé</Badge>}
          {account !== null && (
            <Badge title="Le compte GitHub qui possède ce repo">{account}</Badge>
          )}
          <Language name={remote.language} />
        </div>
        {remote.description && (
          <div
            className="mt-0.5 line-clamp-1 max-w-[52ch] text-[12px] text-muted"
            title={remote.description}
          >
            {remote.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        {local ? (
          <>
            <div className="font-mono text-[12px] text-text">{local.relativePath}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11.5px] text-muted">
              <BranchIcon width="12" height="12" />
              {local.branch ?? 'HEAD détachée'}
            </div>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <SyncCell repo={repo} />
        {result && (
          <div
            role="status"
            className={cx(
              'mt-1 flex max-w-[44ch] items-start gap-1 text-[12px]',
              result.ok ? 'text-ok' : 'text-danger',
            )}
          >
            {result.ok && <CheckIcon width="12" height="12" className="mt-0.5 shrink-0" />}
            {result.message}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <GitHubCell repo={repo} />
      </td>
      {atlasColumn && (
        <td className="px-3 py-2.5">
          <AtlasCell atlas={repo.atlas} />
        </td>
      )}
      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-muted" title={moved ?? ''}>
        {ago(moved) || '—'}
      </td>
      <td className="py-2.5 pr-4 pl-3 text-right">
        {local ? (
          <Button
            variant={needsUpdate(repo) ? 'primary' : 'ghost'}
            busy={busy}
            disabled={!needsUpdate(repo)}
            onClick={() => onUpdate(repo)}
            title={
              needsUpdate(repo)
                ? 'git fetch, puis avance rapide si rien ne s’y oppose. Jamais de merge.'
                : `Rien à mettre à jour : ${noUpdateBecause(repo)}`
            }
          >
            {!busy && <ArrowDownIcon />}
            Mettre à jour
          </Button>
        ) : (
          <Button busy={busy} onClick={() => onClone(repo)}>
            {!busy && <DownloadIcon />}
            Cloner
          </Button>
        )}
      </td>
    </tr>
  )
}

export const RepoTable = ({
  repos,
  accounts,
  busy,
  results,
  onClone,
  onUpdate,
}: {
  repos: RepoStatus[]
  /** The accounts to name on each row; empty when the table shows a single one. */
  accounts: Workspace[]
  busy: ReadonlySet<string>
  results: Readonly<Record<string, ActionResult>>
  onClone: (repo: RepoStatus) => void
  onUpdate: (repo: RepoStatus) => void
}) => {
  if (repos.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-10 text-center text-muted shadow-card">
        Aucun repo ne correspond.
      </div>
    )
  }
  const labels = new Map(accounts.map((account) => [account.login, account.label]))
  // A column only where it says something: a fleet without code-atlas gets none.
  const atlasColumn = repos.some((repo) => repo.atlas !== null)
  const columns = atlasColumn ? 7 : 6
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-card">
      <table
        className={cx(
          'w-full border-collapse text-left',
          atlasColumn ? 'min-w-[1000px]' : 'min-w-[920px]',
        )}
      >
        <thead>
          <tr className="text-[11px] font-semibold tracking-wide text-faint uppercase">
            <th className="py-2.5 pr-3 pl-4 font-semibold">Repo</th>
            <th className="px-3 py-2.5 font-semibold">Clone</th>
            <th className="px-3 py-2.5 font-semibold">État</th>
            <th className="px-3 py-2.5 font-semibold">GitHub</th>
            {atlasColumn && (
              <th
                className="px-3 py-2.5 font-semibold whitespace-nowrap"
                title="Le score que code-atlas a enregistré dans le repo : sa référence, pas une mesure du jour"
              >
                code-atlas
              </th>
            )}
            <th className="px-3 py-2.5 font-semibold">Dernier commit</th>
            <th className="py-2.5 pr-4 pl-3" />
          </tr>
        </thead>
        {groupRepos(repos).map((group) => (
          <tbody key={group.name}>
            <tr className="border-t border-line bg-raised">
              <th
                colSpan={columns}
                scope="colgroup"
                className="px-4 py-1.5 text-[12px] font-semibold text-muted"
              >
                {group.name}
                <span className="ml-1.5 font-normal text-faint">{group.repos.length}</span>
              </th>
            </tr>
            {group.repos.map((repo) => (
              <Row
                key={repo.id}
                repo={repo}
                account={labels.get(repo.workspace) ?? null}
                atlasColumn={atlasColumn}
                busy={busy.has(repo.id)}
                result={results[repo.id]}
                onClone={onClone}
                onUpdate={onUpdate}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
