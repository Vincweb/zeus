import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { WELCOME_PATH } from '../../shared/routes'
import { checkHome } from '../api'
import { useRecentHomes } from '../recent'
import { BoltIcon, Link, cx } from './ui'

/** After this long, the screen admits the wait: GitHub usually answers in five seconds or so. */
const SLOW_AFTER_MS = 12_000

const useSlow = () => {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return slow
}

const Bar = ({ className }: { className: string }) => (
  <span className={cx('skeleton block', className)} />
)

/** Row widths that vary like real names and descriptions do, fixed so nothing jumps on a re-render. */
const ROWS = [
  ['w-28', 'w-64', 'w-36', 'w-16'],
  ['w-36', 'w-52', 'w-44', 'w-20'],
  ['w-24', 'w-60', 'w-32', 'w-16'],
  ['w-40', 'w-56', 'w-40', 'w-24'],
  ['w-32', 'w-48', 'w-36', 'w-16'],
  ['w-28', 'w-60', 'w-44', 'w-20'],
] as const

/** What is being read, one line per source. Both are read at once, and neither is ever faked done. */
const Source = ({ label, detail }: { label: string; detail: string | null }) => (
  <div className="flex items-center gap-2.5 text-[13px]">
    <span className="relative flex size-2">
      <span className="animate-ring absolute inset-0 rounded-full bg-accent-fill" />
      <span className="relative size-2 rounded-full bg-accent-fill" />
    </span>
    <span className="font-medium">{label}</span>
    {detail === null ? (
      <Bar className="h-3 w-40" />
    ) : (
      <span className="min-w-0 truncate text-muted">{detail}</span>
    )}
  </div>
)

/**
 * The few seconds between choosing a folder and seeing its fleet. The screen already has the
 * shape of the one to come — header, six figures, the table — so the page settles instead of
 * jumping, and it says in plain words what Zeus is reading meanwhile.
 *
 * The name comes from the marker alone, which answers at once, or from what this browser remembers.
 */
export const Opening = ({ root }: { root: string }) => {
  const remembered = useRecentHomes().find((recent) => recent.root === root)
  // A folder that cannot be described fails the status too, and that screen says why.
  const described = useQuery({ queryKey: ['home', root], queryFn: () => checkHome(root) })
  const slow = useSlow()

  const name = described.data?.name ?? remembered?.name ?? null
  const label = described.data?.label ?? null
  const accounts = remembered?.accounts ?? []

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
              {name === null ? (
                <Bar className="h-5 w-28" />
              ) : (
                <h1 className="text-[17px] leading-5 font-semibold tracking-tight">{name}</h1>
              )}
              <Link to={WELCOME_PATH} className="text-[12px] text-accent hover:underline">
                Changer de dossier
              </Link>
            </div>
            <div className="mt-0.5 text-[12px] break-all text-muted">
              {label === null ? (
                <Bar className="inline-block h-3 w-44 align-middle" />
              ) : (
                <span className="font-mono text-[11.5px]">{label}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <section
        role="status"
        aria-live="polite"
        className="relative mt-5 overflow-hidden rounded-xl border border-line bg-panel shadow-card"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">
          <span className="relative grid size-14 shrink-0 place-content-center">
            <span className="animate-ring absolute inset-1 rounded-2xl border-2 border-accent-fill" />
            <span className="animate-ring absolute inset-1 rounded-2xl border-2 border-accent-fill [animation-delay:1.1s]" />
            <span className="relative grid size-12 place-content-center rounded-2xl bg-text text-accent-fill">
              <BoltIcon width="26" height="26" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight">
              Zeus fait le tour de ta flotte…
            </h2>
            <div className="mt-2 flex flex-col gap-1.5">
              <Source
                label="GitHub"
                detail={
                  accounts.length > 0
                    ? `les repos de ${accounts.join(', ')}`
                    : 'tes comptes, et les repos de chacun'
                }
              />
              <Source
                label="Cette machine"
                detail={label === null ? null : `les clones sous ${label}`}
              />
            </div>
          </div>
          <p className="max-w-[30ch] text-[12.5px] leading-relaxed text-muted">
            {slow
              ? 'GitHub met plus de temps que d’habitude à répondre. Zeus attend sa réponse.'
              : 'Quelques secondes : le temps que GitHub réponde. Rien n’est modifié pendant la lecture.'}
          </p>
        </div>
        <div className="h-[3px] overflow-hidden bg-line-soft" aria-hidden="true">
          <span className="animate-slide block h-full w-1/4 rounded-full bg-accent-fill" />
        </div>
      </section>

      <div aria-hidden="true">
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {['w-20', 'w-16', 'w-16', 'w-24', 'w-16', 'w-20'].map((width, index) => (
            <div
              key={index}
              className="rounded-xl border border-line bg-panel px-3.5 py-3 shadow-card"
            >
              <Bar className={cx('h-3', width)} />
              <Bar className="mt-2.5 h-7 w-10" />
              <Bar className="mt-2.5 h-3 w-28 max-w-full" />
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Bar className="h-8 w-full max-w-xs rounded-md" />
          <Bar className="h-3 w-24" />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel shadow-card">
          <div className="border-b border-line bg-raised px-4 py-2.5">
            <Bar className="h-3 w-24" />
          </div>
          {ROWS.map(([title, description, clone, state], index) => (
            <div
              key={index}
              className="flex items-center gap-6 border-t border-line-soft px-4 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-[2]">
                <Bar className={cx('h-3.5', title)} />
                <Bar className={cx('mt-2 h-3 max-w-full', description)} />
              </div>
              <div className="hidden min-w-0 flex-1 md:block">
                <Bar className={cx('h-3 max-w-full', clone)} />
                <Bar className="mt-2 h-3 w-14" />
              </div>
              <div className="hidden flex-1 sm:block">
                <Bar className={cx('h-5 rounded-full', state)} />
              </div>
              <Bar className="h-7 w-28 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
