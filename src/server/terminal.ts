import { exec, type ExecResult } from './exec'

/** Whether a click can open a terminal here: Terminal.app, which only macOS has. */
export const canOpenTerminal = () => process.platform === 'darwin'

/**
 * The AppleScript that opens Terminal on a folder and runs a line there. The folder and each word
 * arrive as arguments, after the script, and AppleScript quotes them itself (`quoted form of`):
 * nothing a path holds is ever read as script, nor as shell.
 */
const SCRIPT = [
  'on run argv',
  'set line_ to "cd " & quoted form of (item 1 of argv) & " &&"',
  'repeat with i from 2 to count of argv',
  'set line_ to line_ & " " & quoted form of (item i of argv)',
  'end repeat',
  'tell application "Terminal"',
  'activate',
  'do script line_',
  'end tell',
  'end run',
]

/** The arguments `osascript` is given: the fixed script, then the folder and the words. */
export const terminalArgs = (dir: string, words: string[]) => [
  ...SCRIPT.flatMap((line) => ['-e', line]),
  '--',
  dir,
  ...words,
]

/** What went wrong, in words: macOS refusing to let Zeus drive Terminal is error -1743. */
export const terminalFailure = (result: ExecResult) =>
  /-1743/.test(result.stderr)
    ? 'macOS ne laisse pas Zeus piloter Terminal : autorise-le dans Réglages Système › Confidentialité et sécurité › Automatisation'
    : `Terminal ne s'est pas ouvert : ${result.stderr.trim() || (result.timedOut ? 'délai dépassé' : 'raison inconnue')}`

/**
 * Opens a Terminal window in `dir` and runs `words` there, in the user's own shell, where they
 * can watch it and stop it. The words come from a fixed form (`launchOf`), never from a config.
 */
export const openTerminal = async (dir: string, words: string[]) => {
  const result = await exec('osascript', terminalArgs(dir, words), { timeoutMs: 20_000 })
  if (!result.ok) throw new Error(terminalFailure(result))
}
