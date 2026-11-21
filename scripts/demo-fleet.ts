/**
 * The invented fleet the README pictures are taken against: an account, an organization, their
 * repositories and the clones of some of them. Nothing here is anyone's — `scripts/readme-images.ts`
 * builds it for real in a throwaway home, and answers for GitHub from this file.
 */

/** How a clone stands against what GitHub holds. */
export type DemoState =
  | { kind: 'up-to-date' }
  /** The upstream holds `by` commits the branch lacks. */
  | { kind: 'behind'; by: number }
  /** The branch holds `by` commits never pushed. */
  | { kind: 'ahead'; by: number }
  /** In step with its upstream, with files modified and one new. */
  | { kind: 'dirty' }
  /** GitHub holds commits this clone has never fetched. */
  | { kind: 'unfetched' }

export type DemoClone = {
  /** Where it sits under the root — not always where a new clone would go. */
  path: string
  state: DemoState
  /** An npm project: a package.json and a lockfile. */
  npm?: boolean
  /** With code-atlas among its development dependencies. */
  codeAtlas?: boolean
  claudeMd?: boolean
  workflow?: boolean
}

export type DemoRepo = {
  name: string
  description: string
  language: string | null
  isPrivate?: boolean
  /** Days since the last push. */
  pushedDaysAgo: number
  ci: 'SUCCESS' | 'FAILURE' | 'PENDING' | null
  pullRequests: number
  issues: number
  clone?: DemoClone
}

/** The account `gh` is signed in as, and the organization it belongs to. */
export const USER = 'ada'
export const ORG = 'acme'

export const FLEET: Record<string, DemoRepo[]> = {
  [USER]: [
    {
      name: 'dotfiles',
      description: 'Shell, git and editor config, behind one install script',
      language: 'Shell',
      pushedDaysAgo: 9,
      ci: null,
      pullRequests: 0,
      issues: 0,
      clone: { path: 'dotfiles', state: { kind: 'up-to-date' } },
    },
    {
      name: 'blog',
      description: 'Personal site and notes, built with Astro',
      language: 'Astro',
      pushedDaysAgo: 2,
      ci: 'SUCCESS',
      pullRequests: 0,
      issues: 2,
      clone: { path: 'Sites/blog', state: { kind: 'dirty' }, npm: true, workflow: true },
    },
    {
      name: 'weather-cli',
      description: 'The forecast in the terminal, from open data',
      language: 'Go',
      pushedDaysAgo: 21,
      ci: 'SUCCESS',
      pullRequests: 0,
      issues: 1,
      clone: { path: 'Side/weather-cli', state: { kind: 'ahead', by: 2 }, workflow: true },
    },
    {
      name: 'recipes-api',
      description: 'Family recipes behind a small REST API',
      language: 'TypeScript',
      isPrivate: true,
      pushedDaysAgo: 1,
      ci: 'FAILURE',
      pullRequests: 1,
      issues: 0,
      clone: {
        path: 'Side/recipes-api',
        state: { kind: 'behind', by: 4 },
        npm: true,
        claudeMd: true,
        workflow: true,
      },
    },
    {
      name: 'photo-journal',
      description: 'A static gallery generated from a folder of photos',
      language: 'Python',
      pushedDaysAgo: 64,
      ci: null,
      pullRequests: 0,
      issues: 3,
    },
    {
      name: 'til',
      description: 'Today I learned: short notes, one per file',
      language: null,
      pushedDaysAgo: 5,
      ci: null,
      pullRequests: 0,
      issues: 0,
    },
    {
      name: 'advent-of-code',
      description: 'Puzzles, one folder per year',
      language: 'Rust',
      pushedDaysAgo: 330,
      ci: 'SUCCESS',
      pullRequests: 0,
      issues: 0,
    },
    {
      name: 'garden-sensors',
      description: 'Firmware and dashboard for the greenhouse',
      language: 'C++',
      isPrivate: true,
      pushedDaysAgo: 140,
      ci: null,
      pullRequests: 0,
      issues: 4,
    },
  ],
  [ORG]: [
    {
      name: 'storefront',
      description: 'The shop: catalogue, cart and checkout pages',
      language: 'TypeScript',
      isPrivate: true,
      pushedDaysAgo: 0,
      ci: 'SUCCESS',
      pullRequests: 4,
      issues: 12,
      clone: {
        path: 'acme/storefront',
        state: { kind: 'behind', by: 3 },
        npm: true,
        codeAtlas: true,
        claudeMd: true,
        workflow: true,
      },
    },
    {
      name: 'checkout-api',
      description: 'Orders, payments and invoices',
      language: 'TypeScript',
      isPrivate: true,
      pushedDaysAgo: 0,
      ci: 'FAILURE',
      pullRequests: 2,
      issues: 5,
      clone: {
        path: 'acme/checkout-api',
        state: { kind: 'dirty' },
        npm: true,
        claudeMd: true,
        workflow: true,
      },
    },
    {
      name: 'design-system',
      description: 'Shared React components and design tokens',
      language: 'TypeScript',
      pushedDaysAgo: 3,
      ci: 'SUCCESS',
      pullRequests: 1,
      issues: 3,
      clone: {
        path: 'acme/design-system',
        state: { kind: 'up-to-date' },
        npm: true,
        codeAtlas: true,
        workflow: true,
      },
    },
    {
      name: 'mobile-app',
      description: 'The iOS and Android app, in React Native',
      language: 'TypeScript',
      isPrivate: true,
      pushedDaysAgo: 0,
      ci: 'PENDING',
      pullRequests: 3,
      issues: 8,
      clone: {
        path: 'acme/mobile-app',
        state: { kind: 'unfetched' },
        npm: true,
        claudeMd: true,
        workflow: true,
      },
    },
    {
      name: 'docs',
      description: 'The public documentation site',
      language: 'MDX',
      pushedDaysAgo: 6,
      ci: 'SUCCESS',
      pullRequests: 0,
      issues: 1,
      clone: { path: 'acme/docs', state: { kind: 'ahead', by: 1 }, npm: true, workflow: true },
    },
    {
      name: 'infra',
      description: 'Terraform for every environment',
      language: 'HCL',
      isPrivate: true,
      pushedDaysAgo: 4,
      ci: 'SUCCESS',
      pullRequests: 1,
      issues: 0,
    },
    {
      name: 'billing-worker',
      description: 'Nightly invoicing and reminder jobs',
      language: 'Go',
      isPrivate: true,
      pushedDaysAgo: 12,
      ci: 'SUCCESS',
      pullRequests: 0,
      issues: 1,
    },
    {
      name: 'analytics-pipeline',
      description: 'Events from the shop into the warehouse',
      language: 'Python',
      isPrivate: true,
      pushedDaysAgo: 1,
      ci: 'FAILURE',
      pullRequests: 1,
      issues: 6,
    },
    {
      name: 'admin-console',
      description: 'The back office for support and operations',
      language: 'TypeScript',
      isPrivate: true,
      pushedDaysAgo: 7,
      ci: 'SUCCESS',
      pullRequests: 2,
      issues: 9,
    },
    {
      name: 'search-service',
      description: 'Product search and suggestions',
      language: 'Rust',
      isPrivate: true,
      pushedDaysAgo: 33,
      ci: 'SUCCESS',
      pullRequests: 0,
      issues: 2,
    },
    {
      name: 'handbook',
      description: 'How we work: onboarding, on-call, releases',
      language: null,
      isPrivate: true,
      pushedDaysAgo: 18,
      ci: null,
      pullRequests: 0,
      issues: 0,
    },
  ],
}

/** Git folders under the root that are the clone of no followed repository, and why. */
export const STRAYS: { path: string; origin: string | null }[] = [
  { path: 'Sandbox/prototype', origin: null },
  { path: 'Vendor/geo-utils', origin: 'git@github.com:northwind-labs/geo-utils.git' },
  { path: 'Archive/old-notes', origin: 'https://gitlab.com/ada/old-notes.git' },
]

/** What the root's own config adds to the default tools: a Claude Code plugin, not installed yet. */
export const CONFIG = {
  tools: [
    {
      id: 'caudron-plugin',
      name: 'caudron-plugin',
      description:
        "Plugin Claude Code : blueprints d'architecture, règles de code et agents d'audit.",
      url: 'https://github.com/Vincweb/caudron-plugin',
      scope: 'claude-plugin',
      install: {
        kind: 'claude-plugin',
        plugin: 'caudron-plugin@caudron',
        marketplace: 'Vincweb/caudron-plugin',
      },
      detect: { plugin: 'caudron-plugin@caudron' },
    },
  ],
}
