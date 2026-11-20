import type { ReactNode } from 'react'

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    className="size-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: (
      <Icon>
        <path d="M4 6h16M4 12h16M4 18h10" />
        <circle cx="19" cy="18" r="2" />
      </Icon>
    ),
    title: 'Rien à lister, rien à classer',
    text: 'Tu choisis un dossier parent. Tes comptes viennent de gh, tes repos de GitHub, tes clones d’un scan : un workspace, c’est un compte GitHub, et chaque clone est rattaché au sien par son remote.',
  },
  {
    icon: (
      <Icon>
        <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.8" />
      </Icon>
    ),
    title: 'L’état réel, sans rien toucher',
    text: 'Retard sur GitHub, modifications pas commitées, commits à pousser, CI, PR ouvertes, repos jamais clonés, dossiers git que personne ne suit.',
  },
  {
    icon: (
      <Icon>
        <path d="M12 4v13" />
        <path d="m6.5 12 5.5 5.5 5.5-5.5" />
        <path d="M5 20.5h14" />
      </Icon>
    ),
    title: 'Cloner et mettre à jour, tout droit',
    text: 'Un repo ou toute la flotte : un fetch, puis une avance rapide là où rien ne s’y oppose. Jamais de merge, de rebase ni de stash.',
  },
  {
    icon: (
      <Icon>
        <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5v3h3l5.7-5.7a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z" />
      </Icon>
    ),
    title: 'Les outils transverses',
    text: 'code-atlas, plugins Claude Code et les autres : où chacun est en place, et la commande pour le lancer ou l’installer.',
  },
]

const Title = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h2 id={id} className="scroll-mt-6 text-[20px] font-semibold tracking-tight">
    {children}
  </h2>
)

export const Features = () => (
  <section className="flex flex-col gap-4 py-8">
    <Title>Ce que Zeus fait pour toi</Title>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((feature) => (
        <article
          key={feature.title}
          className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 shadow-card"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            {feature.icon}
          </span>
          <h3 className="text-[14px] font-semibold">{feature.title}</h3>
          <p className="text-[13px] leading-relaxed text-muted">{feature.text}</p>
        </article>
      ))}
    </div>
  </section>
)

const STEPS = [
  {
    title: 'Un dossier parent',
    code: '.zeus/',
    text: 'Celui où vivent tes projets. Zeus y pose un dossier .zeus/ et rien d’autre : il le retrouve ensuite depuis n’importe quel sous-dossier, et rien n’est déplacé.',
  },
  {
    title: 'Zeus rapproche les deux côtés',
    code: 'gh + git',
    text: 'GitHub, lu avec ton gh. Tes clones, lus avec git. Lire n’écrit rien, et rien ne quitte ta machine.',
  },
  {
    title: 'Tu regardes, puis tu agis',
    code: 'zeus mcp',
    text: 'Depuis cette page, depuis le terminal, ou depuis Claude Code : une session ouverte sur le workspace interroge Zeus pour savoir où travailler.',
  },
]

export const Steps = () => (
  <section className="flex flex-col gap-4 py-8">
    <Title id="comment">Comment ça marche</Title>
    <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="flex gap-3 rounded-xl border border-line bg-panel p-4 shadow-card"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-fill text-[13px] font-semibold text-on-accent">
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[14px] font-semibold">{step.title}</span>
            <code className="w-fit rounded bg-line-soft px-2 py-0.5 font-mono text-[12px]">
              {step.code}
            </code>
            <span className="text-[13px] leading-relaxed text-muted">{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  </section>
)

const SIDES = [
  {
    name: 'Zeus',
    scope: 'la flotte',
    accent: true,
    points: [
      'quels repos existent, et où sont leurs clones',
      'où en est chacun : retard, travail en cours, CI',
      'le même geste sur plusieurs repos à la fois',
    ],
  },
  {
    name: 'code-atlas',
    scope: 'un projet',
    accent: false,
    points: [
      'l’architecture : features, couches, dépendances',
      'la qualité : règles, score, audits IA',
      'ce qui se lit dans le code d’un seul repo',
    ],
  },
]

/** Where Zeus stops, so nobody looks here for what another tool answers better. */
export const Boundary = () => (
  <section className="flex flex-col gap-4 py-8">
    <Title>Zeus orchestre, il n’analyse pas</Title>
    <p className="max-w-3xl text-[14px] leading-relaxed text-muted">
      Ce qui se voit en regardant un seul repo appartient à l’outil de ce repo. Ce qui demande
      plusieurs repos appartient à Zeus. Les deux se complètent : Zeus lance et rassemble, il ne
      refait pas l’analyse.
    </p>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {SIDES.map((side) => (
        <div
          key={side.name}
          className={
            side.accent
              ? 'rounded-xl border border-accent-fill bg-accent-soft p-4'
              : 'rounded-xl border border-line bg-panel p-4'
          }
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">{side.name}</span>
            <span className="text-[12.5px] text-muted">{side.scope}</span>
          </div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed text-muted">
            {side.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </section>
)

const NEXT = [
  'Scores code-atlas, repo par repo',
  'Installer un outil d’un clic',
  'Un bilan avant de changer de machine',
  'Services : déploiements et quotas',
]

/** What is not there yet, said as such: the page must not promise what it cannot do today. */
export const Roadmap = () => (
  <section className="flex flex-col gap-3 py-8">
    <Title>La suite</Title>
    <p className="text-[13.5px] text-muted">Pas encore là — prévu, dans cet ordre ou un autre :</p>
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {NEXT.map((item) => (
        <li
          key={item}
          className="rounded-full border border-dashed border-line px-3 py-1 text-[12.5px] text-muted"
        >
          {item}
        </li>
      ))}
    </ul>
  </section>
)

const TRUST = [
  {
    title: 'Local',
    text: 'Cette page ne répond qu’à cette machine, et refuse toute autre origine.',
  },
  {
    title: 'Aucun jeton gardé',
    text: 'Zeus lit GitHub avec ton gh : il voit ce que ce login voit, rien de plus.',
  },
  {
    title: 'Toujours tout droit',
    text: 'Une mise à jour avance une branche ou la laisse où elle est. Elle ne fusionne jamais.',
  },
]

export const Trust = () => (
  <section className="grid grid-cols-1 gap-x-8 gap-y-4 border-t border-line py-8 md:grid-cols-3">
    {TRUST.map((item) => (
      <div key={item.title}>
        <h3 className="text-[13.5px] font-semibold">{item.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.text}</p>
      </div>
    ))}
  </section>
)
