import path from 'path'
import { fileURLToPath } from 'url'

const quote = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

/**
 * How to run this very Zeus again from a terminal: the built CLI, or — run from source — the same
 * through tsx. It is what a prompt handed to an agent names, so the agent reads the same state the
 * page shows instead of rebuilding it with git and gh.
 */
export const selfCommand = () => {
  const here = fileURLToPath(import.meta.url)
  // From source this module is `src/server/selfCommand.ts`; built, it is inlined into `dist/cli.js`.
  if (here.includes(`${path.sep}src${path.sep}server${path.sep}`)) {
    const repo = path.resolve(path.dirname(here), '..', '..')
    return `pnpm --dir ${quote(repo)} --silent exec tsx src/cli.ts`
  }
  return `node ${quote(here)}`
}

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
