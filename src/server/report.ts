import type { Orphan, RepoStatus, StatusPayload } from '../shared/types'

const SYNC: Record<RepoStatus['sync'], string> = {
  'not-cloned': 'pas cloné',
  'up-to-date': 'à jour',
  behind: 'en retard',
  ahead: 'à pousser',
  diverged: 'divergé',
  'no-upstream': 'sans amont',
}

const ORPHAN: Record<Orphan['reason'], string> = {
  'no-remote': 'aucun remote',
  'not-github': 'remote hors GitHub',
  'other-account': 'autre compte GitHub',
  'unknown-repo': 'repo que GitHub ne liste plus',
  'not-followed': 'repo non suivi dans ce dossier',
  duplicate: 'autre copie d’un repo déjà suivi',
}

/** How one clone stands, in a few words: the sync state, its counts, and the files in progress. */
export const describeSync = (repo: RepoStatus) => {
  const parts = [SYNC[repo.sync]]
  const local = repo.local
  if (local) {
    if (local.behind) parts.push(`-${local.behind}`)
    if (local.ahead) parts.push(`+${local.ahead}`)
    if (repo.remoteHasNew && !local.behind) parts.push('(à récupérer)')
    if (local.dirtyFiles > 0) parts.push(`· ${local.dirtyFiles} modif.`)
  }
  return parts.join(' ')
}

const table = (rows: string[][]) => {
  const widths = rows.reduce<number[]>(
    (current, row) => row.map((cell, index) => Math.max(current[index] ?? 0, cell.length)),
    [],
  )
  return rows
    .map((row) =>
      row
        .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

/**
 * The status as the terminal shows it: one line per repository, then what needs a look.
 * `only` keeps one workspace — an account, by its login.
 */
export const renderStatus = (status: StatusPayload, only: string | null = null) => {
  const { home, workspaces, orphans, warnings } = status
  const repos = only
    ? status.repos.filter((repo) => repo.workspace.toLowerCase() === only.toLowerCase())
    : status.repos
  const count = (test: (repo: RepoStatus) => boolean) => repos.filter(test).length
  const accounts = workspaces
    .filter((workspace) => !workspace.hidden)
    .map((workspace) =>
      workspace.kind === 'user' ? `${workspace.label} (${workspace.login})` : workspace.login,
    )
  const lines = [
    `${home.label} — ${accounts.join(', ') || 'aucun compte'}`,
    `${repos.length} repos suivis · ${count((repo) => repo.local !== null)} clonés · ${count((repo) => repo.sync === 'behind' || repo.sync === 'diverged')} en retard · ${count((repo) => (repo.local?.dirtyFiles ?? 0) > 0)} avec des modifs · ${count((repo) => repo.remote.ci === 'failure')} CI en échec`,
    '',
    table([
      ['REPO', 'COMPTE', 'DOSSIER', 'BRANCHE', 'ÉTAT', 'CI'],
      ...repos.map((repo) => [
        repo.remote.name,
        repo.workspace,
        repo.local?.relativePath ?? '—',
        repo.local ? (repo.local.branch ?? '(détaché)') : '—',
        describeSync(repo),
        repo.remote.ci === 'none' ? '—' : repo.remote.ci,
      ]),
    ]),
  ]
  if (orphans.length > 0 && !only) {
    lines.push('', 'Autres dossiers git :')
    lines.push(table(orphans.map(({ repo, reason }) => [`  ${repo.relativePath}`, ORPHAN[reason]])))
  }
  // A large account is listed before it is detailed: its "0 CI en échec" is then not a fact yet.
  const unread = repos.filter((repo) => !repo.remote.detailed && !repo.remote.isArchived).length
  if (unread > 0) {
    lines.push(
      '',
      `CI et PR non lues pour ${unread} repos non clonés (gros compte) — « zeus status --full » les attend.`,
    )
  }
  if (status.archived.length > 0) {
    lines.push('', `${status.archived.length} repos archivés non listés.`)
  }
  for (const warning of warnings) lines.push('', `⚠ ${warning}`)
  return lines.join('\n')
}
