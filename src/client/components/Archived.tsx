import type { ArchivedRepo, Workspace } from '../../shared/types'
import { ago } from '../format'
import { Badge, Fold, LockIcon } from './ui'

/**
 * The archived repositories the table leaves out: read-only on GitHub and not cloned here, so
 * there is nothing to do with them. Listed for the record, folded away at the end of the page.
 * `accounts` are named on each line when the page shows more than one.
 */
export const Archived = ({
  archived,
  accounts,
}: {
  archived: ArchivedRepo[]
  accounts: Workspace[]
}) => {
  if (archived.length === 0) return null
  const labels = new Map(accounts.map((account) => [account.login, account.label]))
  return (
    <section>
      <Fold id="archived-title" title="Repos archivés" count={archived.length}>
        <p className="text-[12.5px] text-muted">
          En lecture seule sur GitHub et pas clonés ici, donc hors du tableau. Un archivé qui a un
          clone y reste.
        </p>
        <ul className="m-0 mt-3 list-none divide-y divide-line-soft rounded-xl border border-line bg-panel p-0 shadow-card">
          {archived.map((repo) => (
            <li key={repo.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-semibold text-text hover:text-accent hover:underline"
              >
                {repo.name}
              </a>
              {repo.isPrivate && (
                <span title="Repo privé" className="text-faint">
                  <LockIcon width="12" height="12" />
                </span>
              )}
              {labels.has(repo.workspace) && (
                <Badge title="Le compte GitHub qui possède ce repo">
                  {labels.get(repo.workspace)}
                </Badge>
              )}
              {repo.language && <span className="text-[11.5px] text-muted">{repo.language}</span>}
              <span className="min-w-0 flex-1 truncate text-[12px] text-faint">
                {repo.description}
              </span>
              {repo.pushedAt && (
                <span className="text-[11.5px] whitespace-nowrap text-faint">
                  dernier push {ago(repo.pushedAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Fold>
    </section>
  )
}
