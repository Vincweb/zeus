import net from 'net'

/** The name a `Host` header carries, without its port or the brackets around an IPv6 literal. */
const hostnameOf = (header: string) =>
  (header.startsWith('[') ? header.slice(1, header.indexOf(']')) : header.replace(/:\d*$/, ''))
    .toLowerCase()
    .replace(/\.$/, '')

/**
 * Whether a request was addressed to a name this server answers to.
 *
 * `Sec-Fetch-Site` cannot see DNS rebinding: a page on evil.example whose name is then pointed at
 * 127.0.0.1 is same-origin with this server as far as the browser can tell. What that page cannot
 * change is the name it asked for, which arrives as `Host`. So only names nobody else can repoint
 * get through: an IP literal, `localhost` and anything under it, and the name given to --host.
 */
export const isAllowedHost = (header: string | undefined, bound: string) => {
  // A browser always sends one, so a request without it is not a page acting on anyone's behalf.
  if (!header) return true
  const name = hostnameOf(header)
  return (
    net.isIP(name) !== 0 ||
    name === 'localhost' ||
    name.endsWith('.localhost') ||
    name === hostnameOf(bound)
  )
}

type Headers = Record<string, string | string[] | undefined>

/**
 * Whether a request comes from somewhere other than the page itself. Browsers say where in
 * `Sec-Fetch-Site`; `none` is a URL typed by hand, and a request without the header is not a page
 * acting on someone else's behalf — curl, or the CLI.
 */
export const isForeign = (headers: Headers) => {
  const site = headers['sec-fetch-site']
  return typeof site === 'string' && site !== 'same-origin' && site !== 'none'
}

/**
 * Whether a request may run something — a clone, a fetch. Reading is one thing; these write to
 * the disk, so every door a page on another origin could use is shut:
 *
 * - `Sec-Fetch-Site` and `Origin` must both agree the request comes from this very page;
 * - the body must be declared as JSON, which a cross-origin page cannot send without a preflight
 *   this server never answers.
 *
 * `trusted` names the one other origin the page may live on: the Vite dev server, whose proxy
 * rewrites `Host` to this server's own address, so the two no longer match there.
 */
export const mayAct = (headers: Headers, trusted: string[] = []) => {
  if (isForeign(headers)) return false
  const origin = headers.origin
  if (typeof origin === 'string') {
    try {
      const { host, origin: normalized } = new URL(origin)
      if (host !== headers.host && !trusted.includes(normalized)) return false
    } catch {
      return false
    }
  }
  const type = headers['content-type']
  return typeof type === 'string' && type.split(';')[0]?.trim() === 'application/json'
}
