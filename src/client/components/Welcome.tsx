import { Hero } from './welcome/Hero'
import { Install } from './welcome/Install'
import { Boundary, Features, Roadmap, Steps, Trust } from './welcome/Pitch'
import { Homes } from './welcome/Homes'
import { BoltIcon } from './ui'

const Mark = ({ size }: { size: 'small' | 'large' }) => (
  <span
    className={
      size === 'large'
        ? 'grid size-8 place-content-center rounded-lg bg-text text-accent-fill'
        : 'grid size-6 place-content-center rounded-md bg-text text-accent-fill'
    }
  >
    <BoltIcon width={size === 'large' ? 18 : 13} height={size === 'large' ? 18 : 13} />
  </span>
)

/**
 * The first screen when Zeus is not started in a folder it follows, and the way from one fleet
 * to another. It says what Zeus is for before asking anything, then hands over the choice.
 */
export const Welcome = () => (
  <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
    <header className="flex items-center gap-3 py-5">
      <Mark size="large" />
      <span className="text-[16px] font-semibold tracking-tight">Zeus</span>
      <span className="ml-auto text-[12px] text-muted">v{__APP_VERSION__}</span>
    </header>

    <main>
      <Hero />
      <Homes />
      <Features />
      <Steps />
      <Install />
      <Boundary />
      <Roadmap />
      <Trust />
    </main>

    <footer className="mt-auto flex flex-col items-center gap-2 border-t border-line py-8 text-center text-muted">
      <span className="flex items-center gap-2 text-text">
        <Mark size="small" />
        <span className="font-semibold">Zeus</span>
        <span className="text-muted">v{__APP_VERSION__}</span>
      </span>
      <p className="max-w-md text-[12px] leading-relaxed">
        Sert cette machine uniquement. Lit GitHub avec ton <span className="font-mono">gh</span>,
        tes clones avec <span className="font-mono">git</span>, et ne garde aucun jeton.
      </p>
    </footer>
  </div>
)
