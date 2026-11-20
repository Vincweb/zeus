import fs from 'fs'
import path from 'path'
import type { ActionOutcome, ActionResult, RepoStatus, StatusPayload } from '../shared/types'
import { exec, reasonOf } from './exec'
import { clearInvisible, isEmptyDir } from './folders'
import { SEGMENT } from './home'
import { readBranchStatus } from './local'

type Outcome = { outcome: ActionOutcome; message: string }

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/**
 * Lets git ask the GitHub CLI for a credential when it talks to GitHub over https. It is added to
 * whatever helpers the machine already has, never in their place: a keychain that answers keeps
 * answering first. This is what makes https clones work on a machine that only ran `gh auth login`.
 */
const GITHUB_AUTH = ['-c', 'credential.https://github.com.helper=!gh auth git-credential']

/** `git clone` of one URL into a folder that does not exist yet, or holds nothing. */
export const gitClone = async (url: string, dest: string): Promise<Outcome> => {
  // An empty folder is as good as none; a file by that name, or a folder with content, is not.
  if (fs.existsSync(dest)) {
    if (!isEmptyDir(dest)) return { outcome: 'failed', message: `le dossier ${dest} existe déjà` }
    clearInvisible(dest)
  }
  // `--` ends the options: a URL can never be read as one, whatever it starts with.
  const result = await exec('git', [...GITHUB_AUTH, 'clone', '--quiet', '--', url, dest], {
    timeoutMs: 300_000,
  })
  return result.ok
    ? { outcome: 'cloned', message: `cloné dans ${dest}` }
    : { outcome: 'failed', message: `clone refusé : ${reasonOf(result)}` }
}

/**
 * Brings one clone up to date, and only ever forward: a fetch, then a fast-forward to the upstream
 * when nothing stands in the way. Never a merge, never a rebase, never a stash — a clone with
 * modified files or commits of its own is fetched and left exactly where it was.
 */
export const updateClone = async (dir: string): Promise<Outcome> => {
  const fetched = await exec('git', [...GITHUB_AUTH, 'fetch', '--prune', '--quiet'], {
    cwd: dir,
    timeoutMs: 90_000,
  })
  if (!fetched.ok) return { outcome: 'failed', message: `fetch refusé : ${reasonOf(fetched)}` }

  const status = await readBranchStatus(dir)
  if (!status) return { outcome: 'failed', message: 'git status a échoué après le fetch' }
  if (status.ahead === null || status.behind === null) {
    return {
      outcome: 'fetched-no-upstream',
      message: 'récupéré — la branche courante ne suit aucune branche distante',
    }
  }
  if (status.behind === 0) {
    return {
      outcome: 'up-to-date',
      message:
        status.ahead > 0
          ? `à jour — ${plural(status.ahead, 'commit', 'commits')} à pousser`
          : 'déjà à jour',
    }
  }
  const late = plural(status.behind, 'commit', 'commits')
  if (status.ahead > 0) {
    return {
      outcome: 'diverged',
      message: `récupéré — la branche a divergé (${status.ahead} en avance, ${status.behind} en retard), à régler à la main`,
    }
  }
  if (status.modifiedFiles > 0) {
    return {
      outcome: 'fetched-dirty',
      message: `récupéré — ${late} en attente, non appliqué : ${plural(status.modifiedFiles, 'fichier modifié', 'fichiers modifiés')}`,
    }
  }
  const merged = await exec('git', ['merge', '--ff-only', '--quiet', '@{upstream}'], { cwd: dir })
  return merged.ok
    ? { outcome: 'updated', message: `avancé de ${late}` }
    : { outcome: 'failed', message: `avance rapide refusée : ${reasonOf(merged)}` }
}

const result = (repo: RepoStatus, { outcome, message }: Outcome): ActionResult => ({
  id: repo.id,
  ok: outcome !== 'failed',
  outcome,
  message,
})

/**
 * A destination folder under the root, as the request names it — or null when it is not one Zeus
 * would create. At most three plain names deep, none of them `.` or `..`: enough for
 * `Sites/Vitrine`, nothing that could climb out of the root or hide in a dotfolder.
 */
export const safeFolder = (asked: string): string | null => {
  const parts = asked.split('/').filter((part) => part !== '')
  if (parts.length > 3) return null
  return parts.every((part) => SEGMENT.test(part) && !part.endsWith('.')) ? parts.join('/') : null
}

/**
 * Clones a followed repository under the root. Where is GitHub's own organization, mirrored: the
 * folder of the account that owns it — `acme/` for an organization's repository — unless another
 * folder is asked for.
 *
 * Nothing in the destination comes from the request as a path: the folder is a few plain names
 * checked one by one, the repository's name is GitHub's own, and the result must still land under
 * the root.
 */
export const cloneRepo = async (
  status: StatusPayload,
  repo: RepoStatus,
  asked: string | null,
): Promise<ActionResult> => {
  if (repo.local) {
    return result(repo, {
      outcome: 'failed',
      message: `déjà cloné dans ${repo.local.relativePath}`,
    })
  }
  const { root, folders, cloneProtocol } = status.home
  const account = status.workspaces.find((workspace) => workspace.login === repo.workspace)
  const wanted = asked ?? account?.folder ?? repo.remote.owner
  const folder = folders.includes(wanted) ? wanted : safeFolder(wanted)
  if (folder === null) {
    return result(repo, { outcome: 'failed', message: `dossier de destination refusé : ${wanted}` })
  }
  const dest = path.resolve(root, folder, repo.remote.name)
  if (!dest.startsWith(root + path.sep)) {
    return result(repo, { outcome: 'failed', message: 'destination hors du dossier parent' })
  }
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'erreur inconnue'
    return result(repo, { outcome: 'failed', message: `dossier impossible à créer : ${reason}` })
  }
  const url = cloneProtocol === 'https' ? `${repo.remote.url}.git` : repo.remote.sshUrl
  const outcome = await gitClone(url, dest)
  return result(
    repo,
    outcome.outcome === 'cloned'
      ? { ...outcome, message: `cloné dans ${path.relative(root, dest)}` }
      : outcome,
  )
}

export const updateRepo = async (repo: RepoStatus): Promise<ActionResult> =>
  repo.local
    ? result(repo, await updateClone(repo.local.path))
    : result(repo, { outcome: 'failed', message: 'pas encore cloné — rien à mettre à jour' })
