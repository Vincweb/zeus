import fs from 'fs'

/** Files the system drops into a folder that do not make it any less empty. */
const INVISIBLE = new Set(['.DS_Store', 'Thumbs.db'])

export const isDirectory = (dir: string) => {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/** A folder with nothing of the user's in it. False for a file, or for nothing at all. */
export const isEmptyDir = (dir: string) => {
  try {
    return fs.readdirSync(dir).every((name) => INVISIBLE.has(name))
  } catch {
    return false
  }
}

/**
 * Removes what the system left in an otherwise empty folder. git refuses to clone into a folder
 * that holds a `.DS_Store`, and a folder made in the Finder a minute ago often does.
 */
export const clearInvisible = (dir: string) => {
  for (const name of fs.readdirSync(dir)) {
    if (INVISIBLE.has(name)) fs.rmSync(`${dir}/${name}`, { force: true })
  }
}
