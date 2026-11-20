/** What `zeus mcp` offers: each tool's name, what it answers and the shape of its input. */

export const INSTRUCTIONS = `Zeus knows a fleet of git repositories: the ones the user's GitHub accounts own, where each is cloned under one parent folder on this machine, and how each clone stands. Use it instead of looping over git and gh yourself.

A workspace is a GitHub account — the user's own, or an organization they belong to. Nothing else sorts repositories: a repository is in the workspace of the account that owns it.

Start with \`fleet\` — optionally narrowed to a workspace, or to what needs attention — to see what exists; \`repo\` gives one repository in full, with the absolute path of its clone, which is the folder to work in or to open a session on. \`home\` describes the parent folder itself: the accounts, the tools, and the git folders that are not clones of a followed repository.

Zeus orchestrates, it does not analyse code: for what one repository contains — architecture, quality, dependencies — work in that repository with its own tools. A clone marked not ready (behind GitHub, uncommitted files, detached HEAD) should be looked at with the user before anything is changed in it.

\`update\` and \`clone\` write to the disk: \`update\` fetches and fast-forwards, never merges; \`clone\` never overwrites a folder. Run them only when the user asked for it.`

const ROOT = {
  type: 'string',
  description:
    'The parent folder of the projects — the one holding .zeus/ — or any folder beneath it, absolute or relative to the working directory. Defaults to the one the server was started in or beneath.',
}
const REFRESH = {
  type: 'boolean',
  description:
    'Ask GitHub again instead of reusing what it said in the last minute. The clones are always read afresh.',
}

export const FILTERS = [
  'all',
  'attention',
  'cloned',
  'to-clone',
  'behind',
  'dirty',
  'ahead',
  'ci-failing',
] as const

export type FleetFilter = (typeof FILTERS)[number]

const COMPLETE = {
  type: 'boolean',
  description:
    'Also wait for the CI state and pull request counts of repositories that are not cloned, in an account of more than sixty. Slow — ten seconds for two hundred repositories — and seldom needed: clones are always detailed.',
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true }

export const TOOLS = [
  {
    name: 'fleet',
    description:
      'The followed repositories, one line each: workspace (the GitHub account that owns it), absolute path of the clone, branch, how it compares with GitHub (up-to-date, behind, ahead, diverged, not-cloned, no-upstream), uncommitted files, CI, open pull requests (null where GitHub was not asked yet), and whether the clone is ready to be worked in. With counts for the scope; `ciNotRead` says how many repositories `ciFailing` knows nothing about.',
    annotations: READ_ONLY,
    inputSchema: {
      type: 'object',
      properties: {
        root: ROOT,
        refresh: REFRESH,
        complete: COMPLETE,
        workspace: {
          type: 'string',
          description: 'Keep one workspace: a GitHub account, by its login ("acme").',
        },
        filter: {
          type: 'string',
          enum: FILTERS,
          description:
            '"attention" keeps what needs a look: behind or diverged, uncommitted files, unpushed commits, failing CI. Default "all".',
        },
        search: {
          type: 'string',
          description: 'Words to find in the name, description, language or folder.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'repo',
    description:
      'One followed repository in full: what GitHub says of it, its clone (absolute path, branch, upstream, ahead and behind, uncommitted files, last commit), the tools set up in it, and — when it is not ready to be worked in — why.',
    annotations: READ_ONLY,
    inputSchema: {
      type: 'object',
      properties: {
        root: ROOT,
        refresh: REFRESH,
        repo: {
          type: 'string',
          description:
            'The repository, as "owner/name" or by its bare name when only one carries it.',
        },
      },
      required: ['repo'],
      additionalProperties: false,
    },
  },
  {
    name: 'home',
    description:
      'The parent folder itself: its workspaces (the GitHub accounts gh can see, followed or left out, and the folder new clones of each go to), how clones are fetched on this machine, the cross-project tools and where each is in place, and the git folders under the root that are not clones of a followed repository, each with the reason.',
    annotations: READ_ONLY,
    inputSchema: {
      type: 'object',
      properties: { root: ROOT, refresh: REFRESH },
      additionalProperties: false,
    },
  },
  {
    name: 'update',
    description:
      'Brings clones up to date, and only ever forward: git fetch, then a fast-forward to the upstream when nothing stands in the way. Never a merge, a rebase or a stash — a clone with modified files or commits of its own is fetched and left where it was, and says so. Writes to the disk: run it when the user asked.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        root: ROOT,
        repos: {
          type: 'array',
          items: { type: 'string' },
          description: 'The repositories to update, each as "owner/name" or a bare name.',
        },
        workspace: {
          type: 'string',
          description: 'Every cloned repository of one workspace, by the login of its account.',
        },
        all: { type: 'boolean', description: 'Every cloned repository under the root.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'clone',
    description:
      'Clones one followed repository under the root: in the folder of the account that owns it by default — mirroring GitHub — or in the folder given. Never overwrites: an existing folder is a failure. Writes to the disk: run it when the user asked.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        root: ROOT,
        repo: {
          type: 'string',
          description:
            'The repository, as "owner/name" or by its bare name when only one carries it.',
        },
        folder: {
          type: 'string',
          description:
            'A folder under the root, a few plain names deep ("Sites/Vitrine"); "" for the root itself. Defaults to the folder of the owning account.',
        },
      },
      required: ['repo'],
      additionalProperties: false,
    },
  },
  {
    name: 'install',
    description:
      "Installs one of the cross-project tools `home` lists: a Claude Code plugin, a command-line tool for the whole machine, or a development dependency added to one clone with that clone's own package manager. Only what the tool's recipe comes down to is run. A clone is refused when it has modified files, and is left with a changed package.json and lockfile to commit. Writes to the disk: run it when the user asked.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        root: ROOT,
        tool: {
          type: 'string',
          description: 'The id of the tool, as `home` gives it ("code-atlas").',
        },
        repo: {
          type: 'string',
          description:
            'For a tool that lives in a project: the repository whose clone gets it, as "owner/name" or a bare name.',
        },
      },
      required: ['tool'],
      additionalProperties: false,
    },
  },
] as const

export type ToolName = (typeof TOOLS)[number]['name']
