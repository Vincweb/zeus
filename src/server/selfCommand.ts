import path from 'path'
import { fileURLToPath } from 'url'

const quote = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

/** The package Zeus is published as. */
export const ZEUS_PACKAGE = '@vincweb/zeus'

/**
 * A scope has one registry per machine, and some machines send `@vincweb` to another one, where a
 * plain `npx @vincweb/zeus` answers 404. Naming the registry works on all of them — and this
 * command is written into `.mcp.json` and into prompts, which no one types.
 */
export const NPX_COMMAND = `npx -y --@vincweb:registry=https://registry.npmjs.org ${ZEUS_PACKAGE}`

/** Fetched by npx, the CLI sits in a cache npm empties as it pleases. */
export const fetchedByNpx = (here: string) => here.includes(`${path.sep}_npx${path.sep}`)

/** The command that runs the CLI found at `here`, in a form that will still work tomorrow. */
export const commandAt = (here: string) => {
  // From source this module is `src/server/selfCommand.ts`; built, it is inlined into `dist/cli.js`.
  if (here.includes(`${path.sep}src${path.sep}server${path.sep}`)) {
    const repo = path.resolve(path.dirname(here), '..', '..')
    return `pnpm --dir ${quote(repo)} --silent exec tsx src/cli.ts`
  }
  // In npx's cache, its path would not last.
  if (fetchedByNpx(here)) return NPX_COMMAND
  return `node ${quote(here)}`
}

/** Where the CLI that runs is: this file from source, `dist/cli.js` once built. */
export const cliFile = () => fileURLToPath(import.meta.url)

/**
 * How to run this very Zeus again from a terminal: the built CLI, the package when npx fetched
 * it, or — run from source — the same through tsx. It is what a prompt handed to an agent names,
 * so the agent reads the same state the page shows instead of rebuilding it with git and gh.
 */
export const selfCommand = () => commandAt(cliFile())

/**
 * The table, not the JSON: a fleet of two hundred repositories is a document of 200 KB, which an
 * agent should not swallow whole for want of the MCP tools. `--workspace` narrows it further.
 */
export const statusCommandFor = (root: string) => `${selfCommand()} status --root ${quote(root)}`

/**
 * Declares this Zeus as an MCP server of the project Claude Code is started in — the root.
 * `-s project` writes `.mcp.json` there, so a session opened on the root gets the tools.
 */
export const connectCommand = () => `claude mcp add -s project zeus -- ${selfCommand()} mcp`
