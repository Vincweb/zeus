import fs from 'fs'
import path from 'path'
import type {
  InstallRecipe,
  InstallResult,
  InstallStep,
  LocalRepo,
  ToolConfig,
} from '../shared/types'
import { ConfigError } from './errors'
import { exec, type ExecResult } from './exec'
import { asRecord, asString } from './json'
import { readBranchStatus } from './local'

/**
 * What a recipe may name. Each is a plain name and can never start with a dash: whatever a config
 * says, it reaches the package manager as a package, never as an option.
 */
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PLUGIN = /^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/i
/** A marketplace is a GitHub repository, `owner/name`: nothing else is added on a click. */
const MARKETPLACE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/i

/**
 * Reads the `install` of a tool. A string is not a recipe — it is a command to show — and gives
 * undefined; an object must be one of the known kinds, with names that are only names.
 */
export const toRecipe = (value: unknown, where: string): InstallRecipe | undefined => {
  const recipe = asRecord(value)
  if (!recipe) return undefined
  const refuse = (what: string): never => {
    throw new ConfigError(`${where} : ${what}`)
  }
  const named = (key: string, pattern: RegExp, what: string) => {
    const name = asString(recipe[key])
    if (!name || !pattern.test(name)) return refuse(`"${key}" doit être ${what}`)
    return name
  }
  switch (recipe.kind) {
    case 'claude-plugin':
      return {
        kind: 'claude-plugin',
        plugin: named('plugin', PLUGIN, 'un plugin « nom@marketplace »'),
        marketplace:
          recipe.marketplace === undefined
            ? undefined
            : named('marketplace', MARKETPLACE, 'un dépôt GitHub « compte/nom »'),
      }
    case 'npm-global':
      return { kind: 'npm-global', package: named('package', PACKAGE, 'un nom de paquet npm') }
    case 'dev-dependency':
      return { kind: 'dev-dependency', package: named('package', PACKAGE, 'un nom de paquet npm') }
    default:
      return refuse('"kind" doit valoir claude-plugin, npm-global ou dev-dependency')
  }
}

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'

const LOCKFILES: [string, PackageManager][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

/**
 * The package manager a project already uses, read off its lockfile: adding a dependency with
 * another one would leave a second lockfile behind. npm when nothing says otherwise.
 */
export const packageManagerOf = (dir: string): PackageManager =>
  LOCKFILES.find(([file]) => fs.existsSync(path.join(dir, file)))?.[1] ?? 'npm'

const ADD_DEV: Record<PackageManager, string[]> = {
  bun: ['add', '-d'],
  pnpm: ['add', '-D'],
  yarn: ['add', '-D'],
  npm: ['install', '-D'],
}

type Step = {
  command: string
  args: string[]
  cwd: string
  /** A step whose failure does not stop the rest: adding a marketplace that is already there. */
  optional?: boolean
}

export const displayOf = ({ command, args }: Pick<Step, 'command' | 'args'>) =>
  [command, ...args].join(' ')

/**
 * The commands a recipe comes down to. `dir` is where they run: the clone for a development
 * dependency, the root for the rest. Arguments, not a command line: nothing here goes through a
 * shell.
 */
export const planInstall = (recipe: InstallRecipe, dir: string): Step[] => {
  switch (recipe.kind) {
    case 'claude-plugin':
      return [
        ...(recipe.marketplace
          ? [
              {
                command: 'claude',
                args: ['plugin', 'marketplace', 'add', recipe.marketplace],
                cwd: dir,
                optional: true,
              },
            ]
          : []),
        { command: 'claude', args: ['plugin', 'install', recipe.plugin], cwd: dir },
      ]
    case 'npm-global':
      return [{ command: 'npm', args: ['install', '-g', recipe.package], cwd: dir }]
    case 'dev-dependency':
      return [
        {
          command: packageManagerOf(dir),
          args: [...ADD_DEV[packageManagerOf(dir)], recipe.package],
          cwd: dir,
        },
      ]
  }
}

/** What a click would run, to show beforehand. A development dependency is shown in its npm form. */
export const previewInstall = (recipe: InstallRecipe): string[] =>
  recipe.kind === 'dev-dependency'
    ? [displayOf({ command: 'npm', args: [...ADD_DEV.npm, recipe.package] })]
    : planInstall(recipe, '.').map(displayOf)

/** Whether a clone is a project a development dependency can be added to. */
export const isNpmProject = (dir: string) => fs.existsSync(path.join(dir, 'package.json'))

/** The end of what a command printed: where package managers put what went wrong. */
const tailOf = (result: ExecResult) =>
  (result.timedOut ? 'délai dépassé' : result.stderr.trim() || result.stdout.trim())
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(-4)
    .join('\n')
    .slice(-600)

type Runner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<ExecResult>

/** A dependency tree can take a while to resolve; past this, something is stuck. */
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000

const DONE: Record<InstallRecipe['kind'], (where: string, manager: string) => string> = {
  'claude-plugin': () => 'installé — redémarre Claude Code pour le charger',
  'npm-global': () => 'installé pour toute la machine',
  'dev-dependency': (where, manager) =>
    `ajouté à ${where} avec ${manager} — package.json et le lockfile sont modifiés, à commiter là-bas`,
}

/**
 * A registry that answers 404 is the usual way an npm install fails, and the reason is seldom the
 * package: a scope sent to another registry by `~/.npmrc` hides one that is published elsewhere.
 * So the registry that was asked is named.
 */
export const registryHint = (output: string): string | null => {
  if (!/\bE?404\b/.test(output)) return null
  const host = /https?:\/\/([a-z0-9.-]+)\//i.exec(output)?.[1]
  return host
    ? `le paquet est introuvable sur ${host} — s’il est publié ailleurs, c’est le registre de son scope qui est à corriger dans ~/.npmrc`
    : 'le paquet est introuvable dans le registre npm de cette machine'
}

/**
 * Installs a tool: on the machine, in Claude Code, or in one clone. Nothing is run that the
 * recipe does not come down to, and a clone is only touched when it can be told apart afterwards —
 * a project with a package.json, and no modified file for the new dependency to hide among.
 */
export const installTool = async (
  tool: ToolConfig,
  { root, repoId, clone }: { root: string; repoId: string | null; clone: LocalRepo | null },
  run: Runner = exec,
): Promise<InstallResult> => {
  const refused = (message: string): InstallResult => ({
    tool: tool.id,
    repo: repoId,
    ok: false,
    steps: [],
    message,
  })
  const recipe = tool.install
  if (!recipe)
    return refused('cet outil n’a pas de recette d’installation : sa commande est à copier')

  let dir = root
  if (recipe.kind === 'dev-dependency') {
    if (!clone) return refused('choisis le repo cloné dans lequel l’installer')
    if (!isNpmProject(clone.path)) {
      return refused(`${clone.relativePath} n’a pas de package.json : ce n’est pas un projet npm`)
    }
    // Read now, not taken from a status that may be minutes old: what was clean then may not be.
    const modified = (await readBranchStatus(clone.path))?.modifiedFiles ?? clone.modifiedFiles
    if (modified > 0) {
      return refused(
        `${clone.relativePath} a ${modified} fichier${modified > 1 ? 's' : ''} modifié${modified > 1 ? 's' : ''} : commite ou range d’abord, pour que l’ajout reste lisible`,
      )
    }
    dir = clone.path
  }

  const steps: InstallStep[] = []
  for (const step of planInstall(recipe, dir)) {
    const result = await run(step.command, step.args, {
      cwd: step.cwd,
      timeoutMs: INSTALL_TIMEOUT_MS,
    })
    const missing = result.code === null && !result.timedOut
    steps.push({
      command: displayOf(step),
      ok: result.ok,
      output: missing ? `${step.command} est introuvable sur cette machine` : tailOf(result),
    })
    if (!result.ok && !step.optional) {
      const hint = recipe.kind === 'claude-plugin' ? null : registryHint(tailOf(result))
      return {
        tool: tool.id,
        repo: repoId,
        ok: false,
        steps,
        message: `« ${displayOf(step)} » a échoué${hint ? ` : ${hint}` : ''}`,
      }
    }
  }
  return {
    tool: tool.id,
    repo: repoId,
    ok: true,
    steps,
    message: DONE[recipe.kind](clone?.relativePath ?? '', packageManagerOf(dir)),
  }
}
