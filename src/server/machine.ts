import type { MachineCheck, Owner, OwnersPayload } from '../shared/types'
import { exec, headlineOf, reasonOf } from './exec'

const versionIn = (text: string) => /\d+\.\d+(?:\.\d+)?/.exec(text)?.[0] ?? null

/**
 * Whether GitHub lets this machine in over SSH without asking anything. `ssh -T` to GitHub never
 * opens a shell: it greets the account by name and leaves, which is all there is to read.
 * A host key GitHub has never been seen with counts as a no — nothing is added to known_hosts here.
 */
const canSsh = async () => {
  const result = await exec(
    'ssh',
    ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', 'git@github.com'],
    { timeoutMs: 10_000 },
  )
  return /successfully authenticated/i.test(result.stderr + result.stdout)
}

/**
 * What Zeus needs from this machine: git, the GitHub CLI, an account signed in to it, and a way to
 * fetch clones. Zeus only looks — signing in is `gh auth login`, in a terminal, where the person
 * can answer its questions.
 */
export const checkMachine = async (): Promise<MachineCheck> => {
  const [git, gh, ssh] = await Promise.all([
    exec('git', ['--version']),
    exec('gh', ['--version']),
    canSsh(),
  ])
  let login: string | null = null
  let loginError: string | null = null
  if (gh.ok) {
    const user = await exec('gh', ['api', 'user', '--jq', '.login'], { timeoutMs: 20_000 })
    if (user.ok) login = user.stdout.trim() || null
    // gh opens with what is wrong — "please run: gh auth login" — and ends on a side note.
    else loginError = headlineOf(user)
  }
  return {
    git: { ok: git.ok, version: git.ok ? versionIn(git.stdout) : null },
    gh: { ok: gh.ok, version: gh.ok ? versionIn(gh.stdout) : null },
    login,
    loginError,
    ssh,
    protocol: ssh ? 'ssh' : 'https',
    platform: process.platform,
  }
}

const readOwners = async (): Promise<OwnersPayload> => {
  // Asked together: who you are and which organizations you are in do not depend on each other.
  const [user, orgs] = await Promise.all([
    exec('gh', ['api', 'user', '--jq', '.login'], { timeoutMs: 20_000 }),
    exec('gh', ['api', 'user/orgs', '--paginate', '--jq', '.[].login'], { timeoutMs: 20_000 }),
  ])
  if (!user.ok) {
    const missing = user.code === null && !user.timedOut
    return {
      owners: [],
      error: missing
        ? 'la commande gh est introuvable — installe GitHub CLI puis « gh auth login »'
        : headlineOf(user),
    }
  }
  const owners: Owner[] = [{ login: user.stdout.trim(), kind: 'user' }]
  // Organizations are a bonus: an account whose token cannot list them still has its own repos.
  if (!orgs.ok) return { owners, error: `organisations illisibles : ${reasonOf(orgs)}` }
  for (const login of orgs.stdout.split('\n').filter(Boolean)) owners.push({ login, kind: 'org' })
  return { owners, error: null }
}

let owners: { at: number; result: OwnersPayload } | null = null

/**
 * The account `gh` is signed in as, and the organizations it belongs to: the workspaces. Who you
 * are does not change between two clicks, so the answer is kept for `maxAgeMs`; a failed read is
 * never kept, so signing in shows on the next look.
 */
export const listOwners = async (maxAgeMs = 0): Promise<OwnersPayload> => {
  if (owners && Date.now() - owners.at < maxAgeMs) return owners.result
  const result = await readOwners()
  if (result.owners.length > 0) owners = { at: Date.now(), result }
  return result
}

let protocol: { at: number; value: 'ssh' | 'https' } | null = null

/** How long the answer of the SSH probe is trusted: a key does not come and go within a session. */
const PROTOCOL_GOOD_FOR_MS = 10 * 60 * 1000

/**
 * How clones are fetched on this machine: over SSH when GitHub knows a key here, over https with
 * gh's own login otherwise. A fact of the machine, so it is found out here and never written in a
 * config that travels.
 */
export const cloneProtocol = async () => {
  if (protocol && Date.now() - protocol.at < PROTOCOL_GOOD_FOR_MS) return protocol.value
  const value = (await canSsh()) ? 'ssh' : 'https'
  protocol = { at: Date.now(), value }
  return value
}
