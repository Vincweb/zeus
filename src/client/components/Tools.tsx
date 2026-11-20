import { useState } from 'react'
import type { InstallResult, ToolStatus } from '../../shared/types'
import { installTool } from '../api'
import { plural } from '../format'
import { Badge, Button, CheckIcon, Command, CrossIcon, DownloadIcon, cx, type Tone } from './ui'

const SCOPES: Record<ToolStatus['scope'], string> = {
  repo: 'Par projet',
  machine: 'Sur la machine',
  'claude-plugin': 'Plugin Claude Code',
}

const stateOf = (tool: ToolStatus): { label: string; tone: Tone } => {
  if (tool.scope === 'repo') {
    return tool.repos.length > 0
      ? { label: `En place sur ${plural(tool.repos.length, 'repo', 'repos')}`, tone: 'ok' }
      : { label: 'En place sur aucun repo', tone: 'neutral' }
  }
  if (tool.installed === null) return { label: 'À la demande', tone: 'neutral' }
  return tool.installed
    ? { label: `Installé${tool.version ? ` · ${tool.version}` : ''}`, tone: 'ok' }
    : { label: 'Pas installé', tone: 'warn' }
}

/** What an installation did, command by command, with what each one said when it failed. */
const Outcome = ({ result }: { result: InstallResult }) => (
  <div
    role="status"
    className={cx(
      'mt-2.5 rounded-md px-2.5 py-2 text-[12px]',
      result.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger',
    )}
  >
    <div className="font-medium">{result.message}</div>
    {result.steps.map((step) => (
      <div key={step.command} className="mt-1.5">
        <div className="flex items-start gap-1.5 font-mono text-[11.5px]">
          <span className="mt-0.5 shrink-0">
            {step.ok ? <CheckIcon width="11" height="11" /> : <CrossIcon width="11" height="11" />}
          </span>
          <span className="break-all">{step.command}</span>
        </div>
        {!step.ok && step.output && (
          <pre className="mt-1 max-h-28 overflow-auto font-mono text-[11px] whitespace-pre-wrap opacity-90">
            {step.output}
          </pre>
        )}
      </div>
    ))}
  </div>
)

const failure = (tool: string, repo: string | null, error: unknown): InstallResult => ({
  tool,
  repo,
  ok: false,
  steps: [],
  message: error instanceof Error ? error.message : 'la requête a échoué',
})

/**
 * Installing one tool with a click. What the click runs is shown first — the very commands — and
 * what they answered is shown after. For a tool that lives in a project, the click needs to know
 * which: one of the clones that could take it.
 */
const Install = ({
  root,
  tool,
  names,
  onInstalled,
}: {
  root: string
  tool: ToolStatus
  names: Map<string, string>
  onInstalled: () => void
}) => {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InstallResult | null>(null)
  const [chosen, setChosen] = useState('')
  const perRepo = tool.install?.kind === 'dev-dependency'
  const repo = perRepo ? chosen || (tool.installable[0] ?? '') : null

  const install = () => {
    setBusy(true)
    setResult(null)
    void installTool(root, tool.id, repo)
      .catch((error: unknown) => failure(tool.id, repo, error))
      .then((outcome) => {
        setResult(outcome)
        if (outcome.ok) {
          // The repo just served leaves the list: the next click must not still point at it.
          setChosen('')
          onInstalled()
        }
      })
      .finally(() => setBusy(false))
  }

  // Nothing left to do: installed for the machine, or in every project that could take it.
  const done = perRepo ? tool.installable.length === 0 : tool.installed === true
  if (done && result === null) return null

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      {!done && (
        <>
          <div className="text-[11px] font-medium text-faint">
            {perRepo ? 'Installer dans un repo' : 'Installer'}
          </div>
          {tool.installCommands.map((command) => (
            <code key={command} className="mt-1 block font-mono text-[11.5px] break-all text-muted">
              {command}
            </code>
          ))}
          {perRepo && (
            <p className="mt-1 text-[11.5px] text-faint">
              Avec le gestionnaire du repo choisi : bun, pnpm, yarn ou npm, selon son lockfile.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {perRepo && (
              <select
                aria-label={`Repo où installer ${tool.name}`}
                value={repo ?? ''}
                onChange={(event) => setChosen(event.target.value)}
                className="h-7 max-w-[60%] rounded-md border border-line bg-panel px-1.5 text-[12px] text-text"
              >
                {tool.installable.map((id) => (
                  <option key={id} value={id}>
                    {names.get(id) ?? id}
                  </option>
                ))}
              </select>
            )}
            <Button variant="primary" busy={busy} onClick={install}>
              {!busy && <DownloadIcon />}
              Installer
            </Button>
          </div>
        </>
      )}
      {result && <Outcome result={result} />}
    </div>
  )
}

/** The cross-project tools of a root, where each one stands on this machine, and how to get it. */
export const Tools = ({
  root,
  tools,
  names,
  onInstalled,
}: {
  root: string
  tools: ToolStatus[]
  names: Map<string, string>
  /** Something was installed: what is in place has to be read again. */
  onInstalled: () => void
}) => (
  <section aria-labelledby="tools-title">
    <h2 id="tools-title" className="text-[14px] font-semibold">
      Outils transverses
    </h2>
    <p className="mt-0.5 text-[12.5px] text-muted">
      Ceux de Zeus, plus ceux que <span className="font-mono">.zeus/config.json</span> ajoute. Zeus
      regarde où ils sont en place, et les installe d’un clic — en montrant d’abord ce qu’il lance.
    </p>
    <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => {
        const state = stateOf(tool)
        return (
          <article
            key={tool.id}
            className="rounded-xl border border-line bg-panel p-3.5 shadow-card"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {tool.url ? (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13.5px] font-semibold hover:text-accent hover:underline"
                >
                  {tool.name}
                </a>
              ) : (
                <span className="text-[13.5px] font-semibold">{tool.name}</span>
              )}
              <Badge tone={state.tone}>{state.label}</Badge>
            </div>
            <div className="mt-0.5 text-[11.5px] text-faint">{SCOPES[tool.scope]}</div>
            {tool.description && (
              <p className="mt-1.5 text-[12.5px] text-muted">{tool.description}</p>
            )}
            {tool.repos.length > 0 && (
              <p className="mt-1.5 text-[12px] text-muted">
                {tool.repos.map((id) => names.get(id) ?? id).join(', ')}
              </p>
            )}
            {tool.run && <Command label="Lancer" command={tool.run} />}
            {tool.install ? (
              <Install root={root} tool={tool} names={names} onInstalled={onInstalled} />
            ) : (
              tool.installHint &&
              tool.installed !== true && <Command label="Installer" command={tool.installHint} />
            )}
          </article>
        )
      })}
    </div>
  </section>
)
