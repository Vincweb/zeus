import { useState } from 'react'
import type { JournalEntry, ToolStatus, ToolVersion } from '../../shared/types'
import { runTool } from '../api'
import { plural } from '../format'
import { InstallDialog } from './InstallDialog'
import {
  Badge,
  Button,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Fold,
  PlayIcon,
  Spinner,
  TerminalIcon,
  cx,
  type Tone,
} from './ui'

const SCOPES: Record<ToolStatus['scope'], string> = {
  repo: 'Par projet',
  machine: 'Sur la machine',
  'claude-plugin': 'Plugin Claude Code',
}

const stateOf = (
  tool: ToolStatus,
  version: ToolVersion | undefined,
): { label: string; tone: Tone } | null => {
  // A project's tool: where it is in place shows in the list of repos; here, the machine.
  if (tool.scope === 'repo') {
    if (tool.global === null) return null
    return tool.global
      ? { label: 'Installé sur la machine', tone: 'ok' }
      : { label: 'Pas installé sur la machine', tone: 'neutral' }
  }
  if (tool.installed === null) return { label: 'À la demande', tone: 'neutral' }
  const installed = version?.installed ?? tool.version
  return tool.installed
    ? { label: `Installé${installed ? ` · ${installed}` : ''}`, tone: 'ok' }
    : { label: 'Pas installé', tone: 'warn' }
}

/** A tool's command, copied with one click on its icon. */
const CopyCommand = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      title={copied ? 'Commande copiée' : `Copier la commande : ${command}`}
      aria-label={`Copier la commande : ${command}`}
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />}
    </Button>
  )
}

/**
 * One tool, in a few lines: what it is, where it stands, and what a click does with it. On the
 * left, the one thing to do — launch the tool in Zeus, bring it up to date, install it; on the
 * right, as icons, opening it in Terminal and copying its command. A tool is launched where it is
 * installed, and offered for installation where it is not. Claude Code is not launched from here:
 * « Piloter avec Claude » invites it.
 */
const ToolCard = ({
  root,
  tool,
  version,
  terminal,
  names,
  run,
  onInstall,
  onUpdate,
  onStarted,
  onShow,
  onStop,
}: {
  root: string
  tool: ToolStatus
  version: ToolVersion | undefined
  terminal: boolean
  names: Map<string, string>
  /** Its run in Zeus, while there is one. */
  run: JournalEntry | null
  onInstall: () => void
  onUpdate: () => void
  onStarted: (id: number) => void
  onShow: (id: number) => void
  onStop: (id: number) => void
}) => {
  const [where, setWhere] = useState(tool.runnable[0] ?? '')
  const [launching, setLaunching] = useState<'zeus' | 'terminal' | null>(null)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)
  const state = stateOf(tool, version)
  const perRepo = tool.scope === 'repo'
  const here = tool.runnable.includes(where) ? where : (tool.runnable[0] ?? '')
  const place = perRepo ? ` dans ${names.get(here) ?? here}` : ''

  // Where it is installed: in a clone that depends on it, or on the machine.
  const ready = tool.launch !== null && (perRepo ? here !== '' : tool.installed === true)
  const canStart = ready
  const canTerminal = ready && terminal
  // Installed, its own program; otherwise the configured line, which runs without installing.
  const command = ready ? (tool.launch ?? tool.run) : (tool.run ?? tool.launch)
  const canInstall = tool.install
    ? tool.install.kind === 'dev-dependency'
      ? tool.installable.length > 0
      : tool.installed === false
    : tool.installHint !== undefined && tool.installed !== true
  const canUpdate = version?.outdated === true && tool.updateCommands.length > 0

  const failed = (error: unknown) =>
    setSaid({ ok: false, text: error instanceof Error ? error.message : 'la requête a échoué' })
  const launch = (target: 'zeus' | 'terminal') => {
    setLaunching(target)
    setSaid(null)
    void runTool(root, tool.id, perRepo ? here : null, target)
      .then((answer) => {
        if ('id' in answer) onStarted(answer.id)
        else setSaid({ ok: true, text: 'Ouvert dans Terminal' })
      })
      .catch(failed)
      .finally(() => setLaunching(null))
  }

  return (
    <article className="flex flex-col rounded-xl border border-line bg-panel p-3 shadow-card">
      <div className="flex items-baseline gap-2">
        {tool.url ? (
          <a
            href={tool.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[13.5px] font-semibold hover:text-accent hover:underline"
          >
            {tool.name}
          </a>
        ) : (
          <span className="truncate text-[13.5px] font-semibold">{tool.name}</span>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-faint">{SCOPES[tool.scope]}</span>
      </div>
      {tool.description && (
        <p
          className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted"
          title={tool.description}
        >
          {tool.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {state && <Badge tone={state.tone}>{state.label}</Badge>}
        {version?.latest &&
          (version.outdated ? (
            <Badge tone="info" title={`Installé : ${version.installed ?? '?'}`}>
              {version.latest} disponible
            </Badge>
          ) : (
            <Badge title={`Dernière version : ${version.latest}`}>à jour</Badge>
          ))}
        {run && (
          <Badge tone="info">
            <Spinner className="size-3" /> En cours
          </Badge>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {run ? (
          <>
            <Button onClick={() => onShow(run.id)}>Voir la sortie</Button>
            {run.url && (
              <a
                href={run.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-accent hover:underline"
              >
                Ouvrir
              </a>
            )}
            <Button onClick={() => onStop(run.id)}>Arrêter</Button>
          </>
        ) : (
          <>
            {canStart && perRepo && tool.runnable.length > 1 && (
              <select
                aria-label={`Repo où lancer ${tool.name}`}
                value={here}
                onChange={(event) => setWhere(event.target.value)}
                className="h-7 max-w-[45%] rounded-md border border-line bg-panel px-1.5 text-[12px] text-text"
              >
                {tool.runnable.map((id) => (
                  <option key={id} value={id}>
                    {names.get(id) ?? id}
                  </option>
                ))}
              </select>
            )}
            {canStart && (
              <Button
                busy={launching === 'zeus'}
                onClick={() => launch('zeus')}
                title={`Lance ${tool.launch ?? ''}${place} — ce qu’il écrit s’affiche dans le terminal de Zeus`}
              >
                {launching !== 'zeus' && <PlayIcon />}
                Lancer
                {perRepo && tool.runnable.length === 1 && (
                  <span className="text-faint">· {names.get(here) ?? here}</span>
                )}
              </Button>
            )}
            {canUpdate && (
              <Button variant="primary" onClick={onUpdate}>
                Mettre à jour…
              </Button>
            )}
            {canInstall && (
              <Button onClick={onInstall}>
                <DownloadIcon />
                Installer…
              </Button>
            )}
          </>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {!run && canTerminal && (
            <Button
              busy={launching === 'terminal'}
              onClick={() => launch('terminal')}
              title={`Ouvrir dans Terminal${place} : ${tool.launch ?? ''}`}
              aria-label={`Ouvrir ${tool.name} dans Terminal`}
            >
              {launching !== 'terminal' && <TerminalIcon />}
            </Button>
          )}
          {command && <CopyCommand command={command} />}
        </span>
      </div>
      {said && (
        <p
          role="status"
          className={cx('mt-1.5 text-[11.5px]', said.ok ? 'text-ok' : 'text-danger')}
        >
          {said.text}
        </p>
      )}
    </article>
  )
}

/** The cross-project tools of a root, where each one stands on this machine, and how to get it. */
export const Tools = ({
  root,
  tools,
  names,
  terminal,
  versions,
  onInstalled,
  runs,
  onStarted,
  onShow,
  onStop,
}: {
  root: string
  tools: ToolStatus[]
  names: Map<string, string>
  /** A click can open a terminal on this machine. */
  terminal: boolean
  /** How the installed tools of the machine and of Claude Code compare with their latest release. */
  versions: Record<string, ToolVersion>
  /** Something was installed or updated: what is in place has to be read again. */
  onInstalled: () => void
  /** The journal of the server: a tool started from here appears there while it runs. */
  runs: JournalEntry[]
  onStarted: (id: number) => void
  onShow: (id: number) => void
  onStop: (id: number) => void
}) => {
  const [installing, setInstalling] = useState<{ tool: ToolStatus; update: boolean } | null>(null)
  // What the folded title says: a tool of the machine or of Claude Code that is missing, or late.
  const missing = tools.filter((tool) => tool.scope !== 'repo' && tool.installed === false).length
  const late = tools.filter((tool) => versions[tool.id]?.outdated === true).length
  return (
    <section>
      <Fold
        id="tools-title"
        title="Outils transverses"
        count={tools.length}
        note={
          <>
            {missing > 0 && (
              <Badge tone="warn">
                {missing} pas installé{missing > 1 ? 's' : ''}
              </Badge>
            )}
            {late > 0 && <Badge tone="info">{plural(late, 'mise à jour', 'mises à jour')}</Badge>}
          </>
        }
      >
        <p className="text-[12.5px] text-muted">
          Ceux de Zeus, plus ceux que <span className="font-mono">.zeus/config.json</span> ajoute. «
          Lancer » le démarre dans Zeus, et son terminal (en haut de page) montre ce qu’il écrit
          {terminal ? ' ; l’icône de terminal l’ouvre plutôt dans Terminal' : ''}. Installer et
          mettre à jour montrent d’abord ce qui sera lancé.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              root={root}
              tool={tool}
              version={versions[tool.id]}
              terminal={terminal}
              names={names}
              run={
                runs.find(
                  (entry) =>
                    entry.kind === 'tool' && entry.toolId === tool.id && entry.state === 'running',
                ) ?? null
              }
              onInstall={() => setInstalling({ tool, update: false })}
              onUpdate={() => setInstalling({ tool, update: true })}
              onStarted={onStarted}
              onShow={onShow}
              onStop={onStop}
            />
          ))}
        </div>
      </Fold>
      {installing && (
        <InstallDialog
          key={`${installing.tool.id}:${String(installing.update)}`}
          root={root}
          tool={installing.tool}
          update={installing.update}
          version={versions[installing.tool.id]}
          names={names}
          onClose={() => setInstalling(null)}
          onDone={onInstalled}
        />
      )}
    </section>
  )
}
