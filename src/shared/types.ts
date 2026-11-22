/** How the last commit of the default branch fared in CI, as GitHub rolls it up. */
export type CiState = 'success' | 'failure' | 'pending' | 'none'

/** A repository as GitHub describes it. */
export type RemoteRepo = {
  /** `owner/name`, in GitHub's own casing. */
  fullName: string
  owner: string
  name: string
  description: string
  url: string
  sshUrl: string
  isPrivate: boolean
  isArchived: boolean
  isFork: boolean
  language: string | null
  /** The last push to any branch — a pull request branch counts. */
  pushedAt: string | null
} & RepoDetail & {
    /**
     * Whether the detail below is GitHub's answer or a blank still to be filled. Listing an
     * account is quick; its detail is not, so a large organization is shown first and detailed
     * after.
     */
    detailed: boolean
  }

/** What GitHub has to work out for a repository, rather than merely look up. */
export type RepoDetail = {
  /** Its name alone doubles the time an account takes to list, so it comes with the detail. */
  defaultBranch: string | null
  /** The commit at the tip of the default branch, which is what "behind" is judged on. */
  headOid: string | null
  headCommittedAt: string | null
  ci: CiState
  openPullRequests: number
  openIssues: number
}

/** A git checkout found under the root. */
export type LocalRepo = {
  /** Absolute path. */
  path: string
  /** Path from the root, the way the page names a clone. */
  relativePath: string
  remoteUrl: string | null
  /** `owner/name` of the origin remote, lowercased, when it points at GitHub. */
  githubId: string | null
  /** Null on a detached HEAD. */
  branch: string | null
  upstream: string | null
  /** Against the upstream as of the last fetch. Null without an upstream. */
  ahead: number | null
  behind: number | null
  /** Every path `git status` lists, untracked files included. */
  dirtyFiles: number
  /** The same without untracked files: what a fast-forward must not run over. */
  modifiedFiles: number
  headOid: string | null
  lastCommitAt: string | null
  hasClaudeMd: boolean
  hasCi: boolean
}

export type SyncState =
  | 'not-cloned'
  | 'up-to-date'
  | 'behind'
  | 'ahead'
  | 'diverged'
  /** A clone whose branch follows nothing, so there is nothing to compare with. */
  | 'no-upstream'

/**
 * A workspace is a GitHub account: yours, or an organization you belong to. Nothing sorts
 * repositories into workspaces but GitHub itself — a repository is in the workspace of the
 * account that owns it, and there is no second organization to keep in step with the first.
 */
export type Workspace = {
  login: string
  kind: 'user' | 'org'
  /** How the page names it: « Perso » for your own account, the login for an organization. */
  label: string
  /** The folder under the root that new clones of its repositories go to. */
  folder: string
  /** Left out of the fleet by the config of this root. */
  hidden: boolean
  /**
   * What can be followed of it: the names of the repositories GitHub lists for it, archived ones
   * only when the root shows them. Empty for an account left out, which GitHub is not asked about.
   */
  repoNames: string[]
  /** The ones this root follows, when not all of them. Null: every one, those to come included. */
  followedRepos: string[] | null
}

/** One followed repository: GitHub's side, the clone when there is one, and how they compare. */
export type RepoStatus = {
  /** `owner/name`, in GitHub's casing. The only handle the page sends back for an action. */
  id: string
  remote: RemoteRepo
  local: LocalRepo | null
  sync: SyncState
  /** GitHub's default branch holds a commit this clone has never fetched. */
  remoteHasNew: boolean
  /** The login of the account that owns it: its workspace. */
  workspace: string
  /** The folder the clone sits in under the root, when it sits in one. */
  group: string | null
}

export type OrphanReason =
  /** No `origin` remote at all. */
  | 'no-remote'
  /** An origin that is not on GitHub. */
  | 'not-github'
  /** A GitHub origin under an account that is not followed: someone else's, or one left out. */
  | 'other-account'
  /** A GitHub origin under a followed account, which GitHub no longer lists: renamed, or gone. */
  | 'unknown-repo'
  /** The repository of a followed account that this root does not follow. */
  | 'not-followed'
  /** A second checkout of a repository already matched to another folder. */
  | 'duplicate'

/**
 * An archived repository the table leaves out: read-only on GitHub and not cloned here. All of it
 * comes with the listing of its account — nothing more is asked of GitHub for it.
 */
export type ArchivedRepo = {
  /** `owner/name`, in GitHub's casing. */
  id: string
  workspace: string
  name: string
  description: string
  url: string
  language: string | null
  isPrivate: boolean
  /** The last push to any branch. */
  pushedAt: string | null
}

/** A git folder under the root that is not the clone of a followed repository. */
export type Orphan = { repo: LocalRepo; reason: OrphanReason }

/** Where a tool applies: one repository at a time, the whole machine, or Claude Code itself. */
export type ToolScope = 'repo' | 'machine' | 'claude-plugin'

/**
 * How a click installs a tool. The kinds are fixed, and a config only ever names a package or a
 * plugin — never a command — so a `.zeus/config.json` cannot make the page run anything else.
 */
export type InstallRecipe =
  /** A Claude Code plugin, `name@marketplace`, and the GitHub repository of that marketplace. */
  | { kind: 'claude-plugin'; plugin: string; marketplace?: string }
  /** A command-line tool installed for the whole machine. */
  | { kind: 'npm-global'; package: string }
  /** A development dependency, added to one clone with that clone's own package manager. */
  | { kind: 'dev-dependency'; package: string }

export type ToolConfig = {
  id: string
  name: string
  description: string
  url?: string
  scope: ToolScope
  /** The command that runs it, shown to copy. */
  run?: string
  /** How a click installs it. */
  install?: InstallRecipe
  /** A command to copy, for a tool no recipe covers. */
  installHint?: string
  detect?: {
    /** Scope `repo`: any of these files in a clone means the tool is set up there. */
    files?: string[]
    /** Scope `repo`: a dependency of the clone's package.json. */
    dependency?: string
    /** Scope `claude-plugin`: the key in Claude Code's installed plugins, `name@marketplace`. */
    plugin?: string
    /** Scope `machine`: a program to find on the PATH. */
    command?: string
  }
}

export type ToolStatus = ToolConfig & {
  /** Null when nothing can tell: a tool fetched on demand leaves no trace to look for. */
  installed: boolean | null
  version: string | null
  /** Scope `repo`: the ids of the followed repositories whose clone has it. */
  repos: string[]
  /**
   * What a click on « Installer » runs, shown before it is run. For a development dependency the
   * program depends on the clone: this is the npm form, and the clone's own manager is used.
   */
  installCommands: string[]
  /** Scope `repo`: the ids of the clones it can be installed in — npm projects that lack it. */
  installable: string[]
}

/** One command of an installation, as it was run and how it ended. */
export type InstallStep = { command: string; ok: boolean; output: string }

export type InstallResult = {
  tool: string
  repo: string | null
  ok: boolean
  steps: InstallStep[]
  /** One line for the page, in French. */
  message: string
}

export type ClaudeLink = {
  /** The `.mcp.json` of the root declares the Zeus server. */
  connected: boolean
  /** The command that declares it, to run in the root. */
  connectCommand: string
}

/** The parent folder Zeus works in: the one that holds `.zeus/`, with the clones beneath it. */
export type HomeInfo = {
  /** Absolute path. Never stored anywhere: it is wherever `.zeus/` happens to be. */
  root: string
  /** The same, as people write it: `~/Documents/…`. */
  label: string
  /** Its last folder: the name people call it by. */
  name: string
  /** The GitHub account `gh` is signed in as. Null when signed out. */
  login: string | null
  /** The folders under the root that already hold clones. */
  folders: string[]
  /** How new clones are fetched on this machine: ssh when GitHub knows a key here. */
  cloneProtocol: 'ssh' | 'https'
  /** The command that prints this status as a table, for an agent without the MCP tools. */
  statusCommand: string
  claude: ClaudeLink
  version: string
}

export type StatusPayload = {
  generatedAt: string
  home: HomeInfo
  /** Every account `gh` can see, the hidden ones included, so the page can offer them back. */
  workspaces: Workspace[]
  repos: RepoStatus[]
  orphans: Orphan[]
  tools: ToolStatus[]
  /** Archived repositories left out of `repos`, listed at the end of the page for the record. */
  archived: ArchivedRepo[]
  /** Repositories listed but not detailed yet: their CI and counts are still to come. */
  pendingDetails: number
  /** What could not be read: an account GitHub refused, a signed-out gh. */
  warnings: string[]
}

/** The details that were still to come, by repository id. */
export type DetailsPayload = { details: Record<string, RepoDetail>; failed: number }

export type ActionOutcome =
  | 'cloned'
  /** Fast-forwarded to the upstream. */
  | 'updated'
  | 'up-to-date'
  /** Fetched, but tracked files are modified, so the branch was left where it was. */
  | 'fetched-dirty'
  | 'fetched-no-upstream'
  /** Fetched, but the branch and its upstream each hold commits the other lacks. */
  | 'diverged'
  | 'failed'

export type ActionResult = {
  id: string
  ok: boolean
  outcome: ActionOutcome
  /** One line for the page, in French. */
  message: string
}

/** A parent folder offered on the welcome page. */
export type HomeCandidate = {
  /** Absolute path — the handle the page puts in the URL. */
  root: string
  label: string
  name: string
  /** Why it cannot be opened, when it cannot. */
  error: string | null
  /** The one Zeus was started in, or beneath. */
  isLaunch: boolean
}

/** A folder that could become a root: what stands there today. */
export type SetupTarget = {
  dir: string
  label: string
  exists: boolean
  /** It already holds a `.zeus/`. */
  isHome: boolean
  /** A folder above it is already a root, which makes this one part of that fleet. */
  insideHome: string | null
  /** How many git folders a scan finds beneath it. */
  clones: number
}

export type HomesPayload = {
  /** The root Zeus was started in or beneath, when there is one. */
  launch: string | null
  candidates: HomeCandidate[]
  /** The folder Zeus was started in: the natural place for a new root. */
  here: SetupTarget
  version: string
}

/** What Zeus needs from the machine, checked before anything is created. */
export type MachineCheck = {
  git: { ok: boolean; version: string | null }
  gh: { ok: boolean; version: string | null }
  /** The GitHub account `gh` is signed in as. Null when signed out, or without gh. */
  login: string | null
  /** Why the account could not be read, in gh's own words. */
  loginError: string | null
  /** Whether `ssh git@github.com` authenticates without asking anything. */
  ssh: boolean
  /** How new clones are fetched here: ssh when it works, https through gh otherwise. */
  protocol: 'ssh' | 'https'
  platform: string
}

export type Owner = { login: string; kind: 'user' | 'org' }

export type OwnersPayload = { owners: Owner[]; error: string | null }
