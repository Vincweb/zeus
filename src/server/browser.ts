import { spawn } from 'child_process'

/**
 * The URL a browser on this machine reaches the server on. A wildcard bind is not an address to
 * visit, so it becomes loopback; an IPv6 literal needs its brackets.
 */
export const pageUrl = (host: string, port: number) => {
  const reachable = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host
  return `http://${reachable.includes(':') ? `[${reachable}]` : reachable}:${port}`
}

/**
 * Hands the URL to the system's default browser, with the launcher each platform ships rather than
 * a dependency. Best effort: a machine with no launcher still gets the URL printed.
 */
export const openInBrowser = (url: string) => {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Nothing to do: the URL is already on the terminal.
  }
}

/**
 * Opens a link that belongs to another application — `claude://…` — and waits to know whether
 * something took it: unlike a web page, a link nothing answers is an error worth reporting.
 */
export const openUrl = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const [command, args] =
      process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
          ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
          : ['xdg-open', [url]]
    const child = spawn(command, args, { stdio: 'ignore' })
    // A launcher that neither fails nor exits has handed the link over.
    const settled = setTimeout(resolve, 3000)
    child.on('error', (error) => {
      clearTimeout(settled)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(settled)
      if (code === 0) resolve()
      else reject(new Error(`aucune application n'a pris le lien (code ${code ?? 'inconnu'})`))
    })
  })
