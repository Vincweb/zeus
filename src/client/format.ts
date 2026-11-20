const RELATIVE = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** « il y a 3 jours », from an ISO date. Empty for no date at all. */
export const ago = (iso: string | null, now = Date.now()) => {
  if (!iso) return ''
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit)
  }
  return "à l'instant"
}

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
