import { setupPath } from '../../../shared/routes'
import { Command, Link } from '../ui'

const STEPS = [
  {
    title: 'Les prérequis',
    text: 'Node 20 ou plus, git, et la ligne de commande de GitHub. Sur macOS, avec Homebrew :',
    command: 'brew install node git gh',
    note: 'Ailleurs : nodejs.org, git-scm.com et cli.github.com.',
  },
  {
    title: 'Te connecter à GitHub',
    text: 'Une fois par machine. Zeus lit GitHub avec cette connexion et ne garde aucun jeton.',
    command: 'gh auth login',
    note: null,
  },
  {
    title: 'Lancer Zeus dans le dossier de tes projets',
    text: 'Dans un dossier vide ou déjà plein : Zeus ouvre cette page et te guide.',
    command: 'npx @vincweb/zeus',
    note: 'Pas encore possible : le paquet n’est pas publié. D’ici là, il faut cloner le dépôt de Zeus et le construire (pnpm install, pnpm build), puis lancer node dist/cli.js.',
  },
]

/**
 * How Zeus gets onto another machine. Said here, on the page people land on, because the whole
 * point is that a machine is replaceable: three commands, and the fleet is back.
 */
export const Install = () => (
  <section className="flex flex-col gap-4 py-8">
    <div>
      <h2 id="installer" className="scroll-mt-6 text-[20px] font-semibold tracking-tight">
        Installer Zeus sur une autre machine
      </h2>
      <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-muted">
        Rien n’est à transporter : tes repos sont sur GitHub, et Zeus ne retient rien d’autre. Sur
        un ordinateur neuf, trois commandes suffiront, puis il ne reste qu’à cloner.
      </p>
    </div>
    <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="flex flex-col rounded-xl border border-line bg-panel p-4 shadow-card"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-fill text-[13px] font-semibold text-on-accent">
              {index + 1}
            </span>
            <span className="text-[14px] font-semibold">{step.title}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.text}</p>
          <div className="mt-2">
            <Command command={step.command} />
          </div>
          {step.note && <p className="mt-2 text-[12px] leading-relaxed text-faint">{step.note}</p>}
        </li>
      ))}
    </ol>
    <p className="text-[13.5px] text-muted">
      Ensuite, Zeus vérifie la machine, te demande le dossier parent de tes projets, et retrouve tes
      comptes et tes repos tout seul —{' '}
      <Link to={setupPath()} className="font-medium text-accent hover:underline">
        voir la configuration
      </Link>
      .
    </p>
  </section>
)
