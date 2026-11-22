import { useEffect, useRef, useState } from 'react'
import type { InstallResult, ToolStatus, ToolVersion } from '../../shared/types'
import { installTool } from '../api'
import { Button, CheckIcon, Command, CrossIcon, DownloadIcon, cx } from './ui'

/** What an installation did, command by command, with what each one said when it failed. */
const Outcome = ({ result }: { result: InstallResult }) => (
  <div
    role="status"
    className={cx(
      'mt-3 rounded-md px-2.5 py-2 text-[12px]',
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
 * Installing or updating one tool, in a window of its own. What the click runs is shown first —
 * the very commands — and what they answered is shown after. For a tool that lives in a project,
 * the click needs to know which: one of the clones that could take it. A tool no recipe covers
 * only has its command, to copy.
 */
export const InstallDialog = ({
  root,
  tool,
  update,
  version,
  names,
  onClose,
  onDone,
}: {
  root: string
  tool: ToolStatus
  update: boolean
  version: ToolVersion | undefined
  names: Map<string, string>
  onClose: () => void
  /** Something was installed or updated: what is in place has to be read again. */
  onDone: () => void
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InstallResult | null>(null)
  const perRepo = !update && tool.install?.kind === 'dev-dependency'
  const [repo, setRepo] = useState(perRepo ? (tool.installable[0] ?? '') : '')
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const commands = update ? tool.updateCommands : tool.installCommands
  const runnable = tool.install !== undefined && commands.length > 0 && (!perRepo || repo !== '')
  const done = result?.ok === true

  const run = () => {
    setBusy(true)
    setResult(null)
    const target = perRepo ? repo : null
    void installTool(root, tool.id, target, update)
      .catch((error: unknown) => failure(tool.id, target, error))
      .then((outcome) => {
        setResult(outcome)
        if (outcome.ok) onDone()
      })
      .finally(() => setBusy(false))
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Escape does not walk away from a run under way: its outcome would never be seen.
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-text shadow-lift"
    >
      <div className="p-5">
        <h2 className="text-[15px] font-semibold">
          {update ? 'Mettre à jour' : 'Installer'} {tool.name}
        </h2>
        {update && version?.latest ? (
          <p className="mt-1 text-[12.5px] text-muted">
            <span className="font-mono">{version.installed}</span> →{' '}
            <span className="font-mono text-text">{version.latest}</span>
          </p>
        ) : (
          tool.description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{tool.description}</p>
          )
        )}

        {commands.length === 0 ? (
          tool.installHint && (
            <>
              <p className="mt-4 text-[12.5px] text-muted">
                Zeus ne l’installe pas d’un clic : voici sa commande, à lancer toi-même.
              </p>
              <Command command={tool.installHint} />
            </>
          )
        ) : (
          <>
            {perRepo && (
              <label className="mt-4 block">
                <span className="text-[11.5px] font-medium text-faint">Dans quel repo</span>
                <select
                  value={repo}
                  disabled={busy || done}
                  onChange={(event) => setRepo(event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-line bg-panel px-2 text-[12.5px] text-text"
                >
                  {tool.installable.map((id) => (
                    <option key={id} value={id}>
                      {names.get(id) ?? id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-4 text-[11.5px] font-medium text-faint">Ce que Zeus va lancer</div>
            <div className="mt-1 rounded-md bg-line-soft px-2.5 py-2">
              {commands.map((command) => (
                <code key={command} className="block font-mono text-[11.5px] break-all text-text">
                  {command}
                </code>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
              {perRepo
                ? 'Avec le gestionnaire du repo choisi — bun, pnpm, yarn ou npm, selon son lockfile. Le repo doit être propre : l’ajout reste à commiter là-bas.'
                : tool.install?.kind === 'claude-plugin'
                  ? 'Redémarre Claude Code ensuite pour charger le plugin.'
                  : 'Pour toute la machine.'}
            </p>
          </>
        )}

        {result && <Outcome result={result} />}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            {done || !runnable ? 'Fermer' : 'Annuler'}
          </Button>
          {runnable && !done && (
            <Button variant="primary" busy={busy} onClick={run}>
              {!busy && <DownloadIcon />}
              {update ? 'Mettre à jour' : 'Installer'}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  )
}
