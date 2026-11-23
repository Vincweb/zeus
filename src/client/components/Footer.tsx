import type { ReactNode } from 'react'
import type { ZeusVersion } from '../../shared/types'
import { Badge, BoltIcon } from './ui'
import { releaseNotes } from './ZeusUpdate'

const REPOSITORY = 'https://github.com/Vincweb/zeus'

const FooterLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="hover:text-text hover:underline">
    {children}
  </a>
)

/** The end of the page: which Zeus this is, what it does and does not, and where to read more. */
export const Footer = ({ version, zeus }: { version: string; zeus: ZeusVersion | null }) => (
  <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5 text-[12px] text-faint">
    <span className="flex items-center gap-1.5 text-muted">
      <BoltIcon className="text-accent" width="13" height="13" />
      <span className="font-medium">Zeus {version || __APP_VERSION__}</span>
      {zeus?.outdated && (
        <>
          <Badge tone="info" title="Une version plus récente de Zeus est publiée sur npm">
            {zeus.latest} disponible
          </Badge>
          <FooterLink href={releaseNotes(zeus.latest)}>nouveautés</FooterLink>
        </>
      )}
      {__APP_DEV__ && (
        <Badge tone="warn" title="La page vient de Vite : Zeus est en cours de développement">
          dev
        </Badge>
      )}
    </span>
    <span>
      sert cette machine uniquement · lit GitHub avec ton <span className="font-mono">gh</span> · ne
      garde aucun jeton
    </span>
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:ml-auto" aria-label="Zeus">
      <FooterLink href={REPOSITORY}>GitHub</FooterLink>
      <FooterLink href={`${REPOSITORY}#readme`}>Documentation</FooterLink>
      <FooterLink href="https://www.npmjs.com/package/@vincweb/zeus">npm</FooterLink>
      <FooterLink href={`${REPOSITORY}/issues`}>Signaler un problème</FooterLink>
    </nav>
  </footer>
)
