const GITHUB_REMOTE =
  /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|(?:https?|git):\/\/(?:[^@/]+@)?github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i

/**
 * `owner/name` of a remote that points at GitHub, lowercased — GitHub compares both without case,
 * and a folder cloned before a rename still carries the old spelling. Null for any other host.
 */
export const githubIdOf = (url: string | null): string | null => {
  if (!url) return null
  const match = GITHUB_REMOTE.exec(url.trim())
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null
}
