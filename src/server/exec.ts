import { execFile } from 'child_process'

export type ExecResult = {
  ok: boolean
  /** The exit code, or null when the process never started or was killed. */
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/**
 * Nothing Zeus starts may stop to ask a question: there is no terminal behind a click on the page,
 * so a credential or host-key prompt would hang until the timeout. Each tool is told to fail
 * instead. A GIT_SSH_COMMAND already set by the user is theirs to keep.
 */
export const quietEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GH_PROMPT_DISABLED: '1',
  GH_NO_UPDATE_NOTIFIER: '1',
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
})

type ExecObserver = (command: string, args: string[], result: ExecResult) => void

let observer: ExecObserver | null = null

/**
 * Who hears of every command once it has ended: the page's server, which keeps those run for an
 * action in its journal. The CLI and `zeus mcp` set none — their output is theirs alone.
 */
export const observeExec = (next: ExecObserver | null) => {
  observer = next
}

/**
 * Runs a command without a shell — arguments are passed as they are, never parsed — and always
 * resolves: a failure is a result to report, not an exception to catch.
 */
export const exec = (
  command: string,
  args: string[],
  { cwd, timeoutMs = 15_000 }: { cwd?: string; timeoutMs?: number } = {},
) =>
  new Promise<ExecResult>((resolve) => {
    execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: quietEnv() },
      (error, stdout, stderr) => {
        const result = {
          ok: error === null,
          code: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
          stdout,
          stderr,
          timedOut: error?.killed === true,
        }
        observer?.(command, args, result)
        resolve(result)
      },
    )
  })

/** The last line a failed command printed, which is where git and gh put the reason. */
export const reasonOf = (result: ExecResult) => {
  if (result.timedOut) return 'délai dépassé'
  const lines = (result.stderr || result.stdout).trim().split('\n')
  const last = lines[lines.length - 1]?.trim()
  if (last) return last
  // No exit code and not a word: the program never started, which means it is not installed.
  return result.code === null ? 'commande introuvable' : `code de sortie ${result.code}`
}

/** The first line instead, for a tool that opens with the point and goes on with alternatives. */
export const headlineOf = (result: ExecResult) =>
  (result.stderr || result.stdout).trim().split('\n')[0]?.trim() || reasonOf(result)

/** `Promise.all` over a list, with at most `limit` tasks in flight. Results keep the order. */
export const mapLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
