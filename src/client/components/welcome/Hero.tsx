import { FleetArt } from './FleetArt'

/** What Zeus is for, said once and plainly, with the way in right under it. */
export const Hero = () => (
  <section className="grid grid-cols-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-14">
    <div className="flex flex-col gap-6">
      <span className="w-fit rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-muted">
        Orchestrateur de repos · tourne sur ta machine
      </span>
      <h1 className="text-[34px] leading-[1.08] font-semibold tracking-tight sm:text-[46px]">
        Toute ta flotte de repos,
        <span className="block text-accent">d’un seul regard.</span>
      </h1>
      <p className="max-w-xl text-[15px] leading-relaxed text-muted">
        Zeus suit les repos de tes comptes GitHub et leurs clones sur cette machine. Il te dit
        lesquels sont en retard, où traîne du travail pas encore commité, ce que dit la CI — et te
        laisse cloner ou mettre à jour d’un clic, sans jamais forcer un merge.
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <a
          href="#dossiers"
          className="rounded-lg bg-accent-fill px-5 py-2.5 text-[14px] font-medium text-on-accent hover:brightness-105"
        >
          Ouvrir ta flotte
        </a>
        <a href="#comment" className="text-[13.5px] font-medium text-accent hover:underline">
          Comment ça marche
        </a>
      </div>
    </div>
    <FleetArt />
  </section>
)
