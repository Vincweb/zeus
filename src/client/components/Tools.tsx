import { useState } from 'react'
import type { ToolStatus, ToolVersion } from '../../shared/types'
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
): { label: string; tone: Tone } => {
  if (tool.scope === 'repo') {
    return tool.repos.length > 0
      ? { label: `En place sur ${plural(tool.repos.length, 'repo', 'repos')}`, tone: 'ok' }
      : { label: 'En place sur aucun repo', tone: 'neutral' }
  }
  if (tool.installed === null) return { label: 'À la demande', tone: 'neutral' }
  const installed = version?.installed ?? tool.version
  return tool.installed
    ? { label: `Installé${installed ? ` · ${installed}` : ''}`, tone: 'ok' }
    : { label: 'Pas installé', tone: 'warn' }
}

/** A command that cannot be launched from here, to copy: elsewhere than on macOS, or with no fixed form. */
const CopyCommand = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      title={command}
      aria-label={`Copier la commande : ${command}`}
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copiée' : 'Copier la commande'}
    </Button>
  )
}

/**
 * One tool, in a few lines: what it is, where it stands, and what a click does with it — launch it
 * in a terminal, install it, bring it up to date. Installing and updating open a window that shows
 * the commands first.
 */
const ToolCard = ({
  root,
  tool,
  version,
  terminal,
  names,
  onInstall,
  onUpdate,
}: {
  root: string
  tool: ToolStatus
  version: ToolVersion | undefined
  terminal: boolean
  names: Map<string, string>
  onInstall: () => void
  onUpdate: () => void
}) => {
  const [where, setWhere] = useState(tool.repos[0] ?? '')
  const [launching, setLaunching] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)
  const state = stateOf(tool, version)
  const perRepo = tool.scope === 'repo'
  const here = tool.repos.includes(where) ? where : (tool.repos[0] ?? '')

  // A project's tool runs in a clone where it is in place; a machine's one once it is installed.
  const canLaunch =
    terminal && tool.launch !== null && (perRepo ? here !== '' : tool.installed === true)
  // Otherwise its command, to copy — the configured one first: `npx …` runs even uninstalled.
  const copyable = canLaunch ? null : (tool.run ?? tool.launch ?? null)
  const canInstall = tool.install
    ? tool.install.kind === 'dev-dependency'
      ? tool.installable.length > 0
      : tool.installed === false
    : tool.installHint !== undefined && tool.installed !== true
  const canUpdate = version?.outdated === true && tool.updateCommands.length > 0

  const launch = () => {
    setLaunching(true)
    setSaid(null)
    void runTool(root, tool.id, perRepo ? here : null)
      .then(() => setSaid({ ok: true, text: 'Ouvert dans Terminal' }))
      .catch((error: unknown) =>
        setSaid({
          ok: false,
          text: error instanceof Error ? error.message : 'la requête a échoué',
        }),
      )
      .finally(() => setLaunching(false))
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
        <Badge tone={state.tone}>{state.label}</Badge>
        {version?.latest &&
          (version.outdated ? (
            <Badge tone="info" title={`Installé : ${version.installed ?? '?'}`}>
              {version.latest} disponible
            </Badge>
          ) : (
            <Badge title={`Dernière version : ${version.latest}`}>à jour</Badge>
          ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {canLaunch && perRepo && tool.repos.length > 1 && (
          <select
            aria-label={`Repo où lancer ${tool.name}`}
            value={here}
            onChange={(event) => setWhere(event.target.value)}
            className="h-7 max-w-[45%] rounded-md border border-line bg-panel px-1.5 text-[12px] text-text"
          >
            {tool.repos.map((id) => (
              <option key={id} value={id}>
                {names.get(id) ?? id}
              </option>
            ))}
          </select>
        )}
        {canLaunch && (
          <Button
            busy={launching}
            onClick={launch}
            title={`Ouvre Terminal${perRepo ? ` dans ${names.get(here) ?? here}` : ''} et lance ${tool.launch ?? ''}`}
          >
            {!launching && <TerminalIcon />}
            Lancer
            {perRepo && tool.repos.length === 1 && (
              <span className="text-faint">· {names.get(here) ?? here}</span>
            )}
          </Button>
        )}
        {copyable && <CopyCommand command={copyable} />}
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
          Ceux de Zeus, plus ceux que <span className="font-mono">.zeus/config.json</span> ajoute.
          {terminal
            ? ' « Lancer » ouvre Terminal sur la commande ; installer et mettre à jour montrent d’abord ce qui sera lancé.'
            : ' Installer et mettre à jour montrent d’abord ce qui sera lancé.'}
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
              onInstall={() => setInstalling({ tool, update: false })}
              onUpdate={() => setInstalling({ tool, update: true })}
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
