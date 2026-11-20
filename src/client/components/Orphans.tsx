import type { Orphan } from '../../shared/types'
import { plural } from '../format'
import { Badge } from './ui'

const REASONS: Record<Orphan['reason'], { label: string; hint: string }> = {
  'no-remote': {
    label: 'Aucun remote',
    hint: 'Ce dossier git n’existe que sur cette machine.',
  },
  'not-github': {
    label: 'Remote hors GitHub',
    hint: 'Son origine n’est pas un repo GitHub.',
  },
  'other-account': {
    label: 'Autre compte GitHub',
    hint: 'Son origine est un repo d’un compte qui n’est pas suivi : celui de quelqu’un d’autre, ou un compte que tu as écarté.',
  },
  'unknown-repo': {
    label: 'Plus listé par GitHub',
    hint: 'Son origine est un repo d’un de tes comptes que GitHub ne liste plus : renommé, ou supprimé.',
  },
  duplicate: {
    label: 'Copie en double',
    hint: 'Un autre dossier est déjà le clone de ce repo.',
  },
}

/** Git folders under the root that are not the clone of a followed repository. */
export const Orphans = ({ orphans }: { orphans: Orphan[] }) =>
  orphans.length === 0 ? null : (
    <section aria-labelledby="orphans-title">
      <h2 id="orphans-title" className="text-[14px] font-semibold">
        Autres dossiers git
      </h2>
      <p className="mt-0.5 text-[12.5px] text-muted">
        Trouvés sous le dossier parent, sans repo suivi en face. Zeus n’y touche pas.
      </p>
      <ul className="m-0 mt-3 list-none divide-y divide-line-soft rounded-xl border border-line bg-panel p-0 shadow-card">
        {orphans.map(({ repo, reason }) => (
          <li key={repo.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="font-mono text-[12.5px]">{repo.relativePath}</span>
            <Badge title={REASONS[reason].hint}>{REASONS[reason].label}</Badge>
            {repo.dirtyFiles > 0 && (
              <Badge tone="accent">{plural(repo.dirtyFiles, 'modif', 'modifs')}</Badge>
            )}
            <span className="min-w-0 flex-1 truncate text-right font-mono text-[11.5px] text-faint">
              {repo.remoteUrl ?? ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
