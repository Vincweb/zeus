import { cx } from '../ui'

type State = 'ok' | 'behind' | 'ahead' | 'none'

const W = 110
const H = 28
const CENTER = { x: 240, y: 164 }

/** A handful of made-up repositories around Zeus, one in each state the page knows. */
const NODES: { name: string; x: number; y: number; state: State }[] = [
  { name: 'app-web', x: 6, y: 40, state: 'ok' },
  { name: 'api', x: 6, y: 150, state: 'behind' },
  { name: 'site-vitrine', x: 6, y: 260, state: 'ok' },
  { name: 'docs', x: 185, y: 8, state: 'ok' },
  { name: 'outils', x: 185, y: 292, state: 'ok' },
  { name: 'mobile', x: 364, y: 40, state: 'ahead' },
  { name: 'design-system', x: 364, y: 150, state: 'ok' },
  { name: 'infra', x: 364, y: 260, state: 'none' },
]

const DOT: Record<State, string> = {
  ok: 'fill-ok',
  behind: 'fill-warn',
  ahead: 'fill-info',
  none: 'fill-none stroke-faint',
}

const LINK: Record<State, string> = {
  ok: 'stroke-faint/50',
  behind: 'stroke-warn',
  ahead: 'stroke-info',
  none: 'stroke-faint',
}

/** Where a link leaves a node: the edge that faces the centre. */
const anchorOf = ({ x, y }: { x: number; y: number }) => {
  if (x + W < CENTER.x - 40) return { x: x + W, y: y + H / 2, side: true }
  if (x > CENTER.x + 40) return { x, y: y + H / 2, side: true }
  return { x: x + W / 2, y: y < CENTER.y ? y + H : y, side: false }
}

/** A curve from the centre to a node, leaving sideways for the columns and upright for the rest. */
const pathTo = (node: { x: number; y: number }) => {
  const end = anchorOf(node)
  if (!end.side) return `M${CENTER.x} ${CENTER.y} L${end.x} ${end.y}`
  const mid = (CENTER.x + end.x) / 2
  return `M${CENTER.x} ${CENTER.y} C${mid} ${CENTER.y} ${mid} ${end.y} ${end.x} ${end.y}`
}

const LEGEND: { state: State; label: string }[] = [
  { state: 'ok', label: 'à jour' },
  { state: 'behind', label: 'en retard' },
  { state: 'ahead', label: 'à pousser' },
  { state: 'none', label: 'pas cloné' },
]

/**
 * The idea of the page in one drawing: Zeus in the middle, repositories around it, each link
 * coloured by how its clone stands. Decorative — the text beside it says the same in words.
 */
export const FleetArt = () => (
  <figure className="relative m-0">
    <div className="dot-grid pointer-events-none absolute inset-0" />
    <div className="bolt-glow pointer-events-none absolute top-1/2 left-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2" />
    <svg
      viewBox="0 0 480 328"
      className="relative h-auto w-full"
      role="img"
      aria-label="Zeus au centre, relié à huit repos : cinq à jour, un en retard, un à pousser, un pas encore cloné"
    >
      <ellipse
        cx={CENTER.x}
        cy={CENTER.y}
        rx="150"
        ry="104"
        className="fill-none stroke-line-soft"
      />
      {NODES.map((node) => (
        <path
          key={node.name}
          d={pathTo(node)}
          className={cx('fill-none', LINK[node.state])}
          strokeWidth="1.4"
          strokeDasharray={node.state === 'none' ? '3 5' : undefined}
        />
      ))}
      {/* Two sparks running out along the links that have something to say. */}
      {NODES.filter((node) => node.state === 'behind' || node.state === 'ahead').map((node) => (
        <path
          key={node.name}
          d={pathTo(node)}
          className={cx('animate-spark fill-none', LINK[node.state])}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="10 230"
        />
      ))}

      <rect
        x={CENTER.x - 34}
        y={CENTER.y - 34}
        width="68"
        height="68"
        rx="18"
        className="fill-text"
      />
      <path
        transform={`translate(${CENTER.x - 22} ${CENTER.y - 22}) scale(2.75)`}
        d="M9.2 1.5 3.6 9h3.5l-.8 5.5L12 6.9H8.4z"
        className="fill-accent-fill"
      />

      {NODES.map((node) => (
        <g key={node.name}>
          <rect
            x={node.x}
            y={node.y}
            width={W}
            height={H}
            rx="8"
            className={cx('fill-panel', node.state === 'none' ? 'stroke-faint' : 'stroke-line')}
            strokeDasharray={node.state === 'none' ? '3 4' : undefined}
          />
          <circle
            cx={node.x + 13}
            cy={node.y + H / 2}
            r="3.5"
            className={DOT[node.state]}
            strokeWidth="1.3"
          />
          <text
            x={node.x + 23}
            y={node.y + H / 2 + 3.8}
            className={cx(
              'font-mono text-[10.5px]',
              node.state === 'none' ? 'fill-faint' : 'fill-text',
            )}
          >
            {node.name}
          </text>
        </g>
      ))}
    </svg>
    <figcaption className="relative mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {LEGEND.map(({ state, label }) => (
        <span key={state} className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
            <circle cx="5" cy="5" r="3.6" className={DOT[state]} strokeWidth="1.4" />
          </svg>
          {label}
        </span>
      ))}
    </figcaption>
  </figure>
)
