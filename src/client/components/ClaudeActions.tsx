import { useState } from 'react'
import { openInClaude } from '../api'
import { Button, SparkIcon } from './ui'

/**
 * Hands a prompt to Claude: opened in the desktop app on the root, filled in and not sent —
 * or copied, for any other assistant. The prompt can always be read first.
 */
export const ClaudeActions = ({ root, prompt }: { root: string; prompt: string }) => {
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(false)
  const [launch, setLaunch] = useState<'idle' | 'pending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const launchClaude = () => {
    setLaunch('pending')
    setError(null)
    openInClaude(root, prompt)
      .then(() => {
        setLaunch('done')
        window.setTimeout(() => setLaunch('idle'), 2500)
      })
      .catch((reason: unknown) => {
        setLaunch('idle')
        setError(reason instanceof Error ? reason.message : 'la requête a échoué')
      })
  }
  const copy = () => {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" busy={launch === 'pending'} onClick={launchClaude}>
          {launch !== 'pending' && <SparkIcon />}
          {launch === 'done' ? 'Ouvert dans Claude' : 'Ouvrir dans Claude'}
        </Button>
        <Button onClick={copy}>{copied ? 'Copié' : 'Copier le prompt'}</Button>
        <Button onClick={() => setShown((on) => !on)} aria-expanded={shown}>
          {shown ? 'Masquer le prompt' : 'Voir le prompt'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
      <p className="text-[11.5px] text-faint">
        Ouvre une nouvelle session dans l’app Claude, sur ce dossier. Le prompt est rempli, jamais
        envoyé : tu le relis et tu l’envoies toi-même.
      </p>
      {shown && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-line-soft p-3 font-mono text-[11.5px] leading-5 whitespace-pre-wrap text-text">
          {prompt}
        </pre>
      )}
    </div>
  )
}
