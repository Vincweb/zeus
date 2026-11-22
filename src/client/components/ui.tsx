import {
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SVGProps,
} from 'react'
import { navigate } from '../router'

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')

type IconProps = SVGProps<SVGSVGElement>

const icon = (path: ReactNode, fill = false) =>
  function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {path}
      </svg>
    )
  }

export const BoltIcon = icon(<path d="M9.2 1.5 3.6 9h3.5l-.8 5.5L12 6.9H8.4z" />, true)
export const RefreshIcon = icon(
  <>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
    <path d="M13.5 2.5v3h-3" />
  </>,
)
export const DownloadIcon = icon(
  <>
    <path d="M8 2.5v8" />
    <path d="m4.8 7.5 3.2 3.2 3.2-3.2" />
    <path d="M3 13.5h10" />
  </>,
)
export const ArrowDownIcon = icon(
  <>
    <path d="M8 2.5v10" />
    <path d="m4 8.7 4 4 4-4" />
  </>,
)
export const LockIcon = icon(
  <>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </>,
)
export const CopyIcon = icon(
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </>,
)
export const CheckIcon = icon(<path d="m3.5 8.5 3 3 6-7" />)
export const ChevronIcon = icon(<path d="m6 3.5 4.5 4.5L6 12.5" />)
export const TerminalIcon = icon(
  <>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8" />
    <path d="m4.8 6.3 2 1.7-2 1.7M8.6 10h2.6" />
  </>,
)

/**
 * A section folded away until asked for: its title, how many it holds, and what in it may matter.
 * For what is there for the record rather than for every look.
 */
export const Fold = ({
  id,
  title,
  count,
  note,
  children,
}: {
  id: string
  title: string
  count?: number
  note?: ReactNode
  children: ReactNode
}) => (
  <details className="group">
    <summary className="flex cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden">
      <ChevronIcon className="shrink-0 text-faint transition-transform group-open:rotate-90" />
      <h2 id={id} className="text-[14px] font-semibold">
        {title}
      </h2>
      {count !== undefined && <span className="text-[12px] text-muted tabular-nums">{count}</span>}
      {note}
    </summary>
    <div className="mt-1.5">{children}</div>
  </details>
)
export const BranchIcon = icon(
  <>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="5" r="1.5" />
    <path d="M4.5 5v6M11.5 6.5c0 2.5-3.5 2-7 3.5" />
  </>,
)
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3.3 3.3" />
  </>,
)

export const Spinner = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    className={cx('animate-spin-slow', className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M8 2a6 6 0 1 1-6 6" />
  </svg>
)

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'

const TONES: Record<Tone, string> = {
  neutral: 'bg-line-soft text-muted',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
}

export const Badge = ({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
}) => (
  <span
    title={title}
    className={cx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap',
      TONES[tone],
    )}
  >
    {children}
  </span>
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  busy?: boolean
}

export const Button = ({
  variant = 'ghost',
  busy,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    type="button"
    {...rest}
    disabled={disabled || busy}
    className={cx(
      'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors',
      variant === 'primary'
        ? 'bg-accent-fill text-on-accent hover:brightness-105 disabled:opacity-60'
        : 'border border-line bg-panel text-text hover:bg-raised disabled:text-faint',
      className,
    )}
  >
    {busy && <Spinner />}
    {children}
  </button>
)

/** GitHub's own colours for the languages these repositories are written in. */
const LANGUAGES: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#d9c31c',
  Python: '#3572a5',
  Swift: '#f05138',
  Vue: '#41b883',
  SCSS: '#c6538c',
  HTML: '#e34c26',
  CSS: '#663399',
  Java: '#b07219',
  C: '#7a7a7a',
  Go: '#00add8',
  Rust: '#c9764a',
}

export const Language = ({ name }: { name: string | null }) =>
  name ? (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
      <span
        className="size-2 rounded-full"
        style={{ background: LANGUAGES[name] ?? 'var(--color-faint)' }}
      />
      {name}
    </span>
  ) : null

export const CloseIcon = icon(<path d="m4 4 8 8M12 4l-8 8" />)
export const FolderIcon = icon(
  <path d="M2.5 4.5a1 1 0 0 1 1-1h2.6l1.4 1.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />,
)
export const ArrowRightIcon = icon(
  <>
    <path d="M3 8h10" />
    <path d="m9 4 4 4-4 4" />
  </>,
)

/**
 * A link to another screen of the page: a real `href`, so it opens in a new tab like any link,
 * but a plain click swaps the screen without reloading.
 */
export const Link = ({
  to,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) => (
  <a
    {...rest}
    href={to}
    onClick={(event) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(to)
    }}
  >
    {children}
  </a>
)

/** A command to run in a terminal, with a button that copies it. Zeus shows these; it never runs them. */
export const Command = ({ label, command }: { label?: string; command: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className={label ? 'mt-2' : undefined}>
      {label && <div className="text-[11px] font-medium text-faint">{label}</div>}
      <div className="mt-0.5 flex items-start gap-1.5 rounded-md bg-line-soft px-2 py-1.5">
        <code className="min-w-0 flex-1 font-mono text-[11.5px] break-words whitespace-pre-wrap text-text">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          title="Copier la commande"
          aria-label={`Copier la commande : ${command}`}
          className={cx(
            'shrink-0 rounded p-0.5',
            copied ? 'text-ok' : 'text-muted hover:text-text',
          )}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  )
}

export const CrossIcon = icon(<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />)
export const SparkIcon = icon(
  <path d="M8 1.8 9.4 6l4.3 1.4-4.3 1.4L8 13l-1.4-4.2L2.3 7.4 6.6 6z" />,
)
export const CloudIcon = icon(
  <path d="M4.6 12.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.7 1 2.6 2.6 0 0 1 .1 5z" />,
)
