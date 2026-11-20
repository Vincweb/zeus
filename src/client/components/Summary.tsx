import type { Counts, Filter } from '../model'
import { cx } from './ui'

type Tile = { filter: Filter; label: string; value: string; hint: string; alert: boolean }

/** The fleet in five numbers. Each tile is also the filter that shows what it counts. */
export const Summary = ({
  counts,
  filter,
  onFilter,
}: {
  counts: Counts
  filter: Filter
  onFilter: (filter: Filter) => void
}) => {
  const tiles: Tile[] = [
    {
      filter: 'all',
      label: 'Repos suivis',
      value: String(counts.all),
      hint: `${counts.cloned} clonés sur cette machine`,
      alert: false,
    },
    {
      filter: 'to-clone',
      label: 'À cloner',
      value: String(counts['to-clone']),
      hint: 'sur GitHub, pas en local',
      alert: false,
    },
    {
      filter: 'behind',
      label: 'En retard',
      value: String(counts.behind),
      hint: 'GitHub a des commits en plus',
      alert: counts.behind > 0,
    },
    {
      filter: 'dirty',
      label: 'Modifs en cours',
      value: String(counts.dirty),
      hint: 'fichiers non commités',
      alert: counts.dirty > 0,
    },
    {
      filter: 'ahead',
      label: 'À pousser',
      value: String(counts.ahead),
      hint: 'commits locaux non poussés',
      alert: counts.ahead > 0,
    },
    {
      filter: 'ci',
      label: 'CI en échec',
      value: String(counts.ci),
      hint: 'sur la branche principale',
      alert: counts.ci > 0,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => {
        const active = filter === tile.filter
        return (
          <button
            key={tile.filter}
            type="button"
            aria-pressed={active}
            onClick={() => onFilter(active ? 'all' : tile.filter)}
            className={cx(
              'rounded-xl border bg-panel px-3.5 py-3 text-left shadow-card transition-colors hover:bg-raised',
              active ? 'border-accent-fill ring-1 ring-accent-fill' : 'border-line',
            )}
          >
            <div className="text-[11.5px] font-medium text-muted">{tile.label}</div>
            <div
              className={cx(
                'mt-0.5 text-[26px] leading-8 font-semibold tabular-nums',
                tile.alert && (tile.filter === 'ci' ? 'text-danger' : 'text-warn'),
              )}
            >
              {tile.value}
            </div>
            <div className="mt-0.5 text-[11.5px] text-faint">{tile.hint}</div>
          </button>
        )
      })}
    </div>
  )
}
