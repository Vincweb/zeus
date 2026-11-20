import type { ToolStatus } from '../../shared/types'
import { plural } from '../format'
import { Badge, Command, type Tone } from './ui'

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

/** The cross-project tools the workspace lists, and where each one stands on this machine. */
export const Tools = ({ tools, names }: { tools: ToolStatus[]; names: Map<string, string> }) => (
  <section aria-labelledby="tools-title">
    <h2 id="tools-title" className="text-[14px] font-semibold">
      Outils transverses
    </h2>
    <p className="mt-0.5 text-[12.5px] text-muted">
      Ceux de Zeus, plus ceux que <span className="font-mono">.zeus/config.json</span> ajoute. Zeus
      regarde où ils sont en place ; l’installation se fait pour l’instant avec la commande à
      copier.
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
            {tool.install && tool.installed !== true && (
              <Command label="Installer" command={tool.install} />
            )}
          </article>
        )
      })}
    </div>
  </section>
)
