import fs from 'fs'
import path from 'path'
import type { LocalRepo } from '../shared/types'
import { exec } from './exec'
import { githubIdOf } from './remoteUrl'

/** Folders that hold other people's code or build output: never a project of yours. */
const SKIPPED = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  'vendor',
  'Pods',
  'DerivedData',
])

/**
 * Every folder under `root` that holds a `.git`, down to `maxDepth` levels.
 *
 * The walk goes on inside a repository: a meta-project keeps its sub-projects as independent
 * repositories it ignores. Hidden folders are skipped whole, which also leaves out the worktrees
 * Claude Code keeps under `.claude/worktrees` — checkouts of a repository already counted.
 */
export const findRepos = (root: string, maxDepth: number): string[] => {
  const found: string[] = []
  const visit = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.name === '.git')) found.push(dir)
    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue
      visit(path.join(dir, entry.name), depth + 1)
    }
  }
  visit(root, 0)
  return found.sort()
}

export type BranchStatus = Pick<
  LocalRepo,
  'headOid' | 'branch' | 'upstream' | 'ahead' | 'behind' | 'dirtyFiles' | 'modifiedFiles'
>

/**
 * Reads `git status --porcelain=v2 --branch`. The header lines name the branch and how it compares
 * with its upstream; every other line is one changed path. `branch.ab` is absent when the branch
 * follows nothing, or follows a branch that is gone — both leave ahead and behind unknown.
 */
export const parseStatus = (output: string): BranchStatus => {
  const status: BranchStatus = {
    headOid: null,
    branch: null,
    upstream: null,
    ahead: null,
    behind: null,
    dirtyFiles: 0,
    modifiedFiles: 0,
  }
  for (const line of output.split('\n')) {
    if (line === '') continue
    if (line.startsWith('# branch.oid ')) {
      const oid = line.slice('# branch.oid '.length)
      // A repository without a single commit says "(initial)".
      status.headOid = oid.startsWith('(') ? null : oid
    } else if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      status.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      status.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const counts = /^\+(\d+) -(\d+)$/.exec(line.slice('# branch.ab '.length))
      if (counts) {
        status.ahead = Number(counts[1])
        status.behind = Number(counts[2])
      }
    } else if (!line.startsWith('#')) {
      status.dirtyFiles += 1
      if (!line.startsWith('? ')) status.modifiedFiles += 1
    }
  }
  return status
}

const hasWorkflows = (dir: string) => {
  try {
    return fs
      .readdirSync(path.join(dir, '.github', 'workflows'))
      .some((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  } catch {
    return false
  }
}

/** `--no-optional-locks`, so reading a status never contends with a git the user is running. */
export const readBranchStatus = async (dir: string) => {
  const status = await exec(
    'git',
    ['--no-optional-locks', 'status', '--porcelain=v2', '--branch'],
    { cwd: dir },
  )
  return status.ok ? parseStatus(status.stdout) : null
}

/** What git says about one checkout. Reads only: nothing is fetched and nothing is written. */
export const readLocalRepo = async (root: string, dir: string): Promise<LocalRepo> => {
  const [branch, remote, log] = await Promise.all([
    readBranchStatus(dir),
    exec('git', ['remote', 'get-url', 'origin'], { cwd: dir }),
    // Fails on a repository without a commit, which is then simply dateless.
    exec('git', ['log', '-1', '--format=%cI'], { cwd: dir }),
  ])
  const remoteUrl = remote.ok ? remote.stdout.trim() || null : null
  return {
    path: dir,
    relativePath: path.relative(root, dir) || '.',
    remoteUrl,
    githubId: githubIdOf(remoteUrl),
    ...(branch ?? parseStatus('')),
    lastCommitAt: log.ok ? log.stdout.trim() || null : null,
    hasClaudeMd: fs.existsSync(path.join(dir, 'CLAUDE.md')),
    hasCi: hasWorkflows(dir),
  }
}

/** Whether a checkout already holds a commit, fetched or made there. */
export const hasCommit = async (dir: string, oid: string) =>
  (await exec('git', ['cat-file', '-e', `${oid}^{commit}`], { cwd: dir })).ok
