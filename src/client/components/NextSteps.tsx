import type { ReactNode } from 'react'
import type { HomeInfo, RepoStatus, Workspace } from '../../shared/types'
import { plural } from '../format'
import { Button, Command, DownloadIcon, SparkIcon } from './ui'

const Card = ({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode
  title: string
  text: ReactNode
  children?: ReactNode
}) => (
  <article className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 shadow-card">
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-content-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </span>
      <h3 className="text-[14px] font-semibold">{title}</h3>
    </div>
    <p className="text-[12.5px] leading-relaxed text-muted">{text}</p>
    {children && <div className="mt-auto pt-1">{children}</div>}
  </article>
)

/**
 * What is left to do here: repositories with no clone yet, a Claude Code that does not see the
 * fleet. Each card leaves when its reason does.
 */
export const NextSteps = ({
  home,
  account,
  missing,
  busy,
  onCloneAll,
}: {
  home: HomeInfo
  /** The account in view, when a single one is: cloning everything is done one account at a time. */
  account: Workspace | null
  /** The repositories in view with no clone under the root. */
  missing: RepoStatus[]
  busy: boolean
  onCloneAll: () => void
}) => {
  const unconnected = !home.claude.connected
  if (missing.length === 0 && !unconnected) return null

  return (
    <section aria-labelledby="next-title">
      <h2 id="next-title" className="text-[11px] font-semibold tracking-wide text-faint uppercase">
        À faire ici
      </h2>
      <div className="mt-2 grid gap-2.5 md:grid-cols-2">
        {missing.length > 0 && (
          <Card
            icon={<DownloadIcon width="16" height="16" />}
            title={`${plural(missing.length, 'repo', 'repos')} pas encore ${missing.length > 1 ? 'clonés' : 'cloné'}`}
            text={
              account ? (
                <>
                  Chacun irait dans{' '}
                  <span className="font-mono">
                    {home.name}/{account.folder}/
                  </span>
                  , le dossier du compte {account.login} : la même organisation que sur GitHub.
                </>
              ) : (
                'Sur plusieurs comptes. Choisis un compte dans les onglets pour cloner ce qui lui manque, ou clone un repo à la fois depuis sa ligne.'
              )
            }
          >
            {account && (
              <Button variant="primary" busy={busy} onClick={onCloneAll}>
                {!busy && <DownloadIcon />}
                Tout cloner…
              </Button>
            )}
          </Card>
        )}

        {unconnected && (
          <Card
            icon={<SparkIcon width="16" height="16" />}
            title="Claude ne voit pas encore cette flotte"
            text="Avec le serveur MCP de Zeus, une session Claude Code ouverte dans ce dossier connaît les repos, le chemin de chaque clone, lequel est en retard ou en cours de modification. Lance cette commande dans le dossier parent :"
          >
            <Command command={home.claude.connectCommand} />
          </Card>
        )}
      </div>
    </section>
  )
}
