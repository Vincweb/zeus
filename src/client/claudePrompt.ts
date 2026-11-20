import type { HomeInfo } from '../shared/types'

/**
 * What the orchestrating session is opened with: read the fleet through Zeus, say what needs a
 * look, and stop there. The prompt is shown before it is used and never sent for the person —
 * they read it, change it, and send it themselves.
 */
export const orchestratorPrompt = (home: HomeInfo) =>
  `Tu es dans ${home.root} : le dossier parent de mes projets. Zeus y suit mes repos GitHub — un workspace par compte — et leurs clones.

Fais le point sur ma flotte :

1. Avec les outils MCP de Zeus : \`fleet\` avec \`filter: "attention"\`, puis \`home\` pour les autres dossiers git. S'ils ne sont pas disponibles, lance à la place cette commande, qui rend un tableau (ajoute \`--workspace <compte>\` pour un seul compte) : ${home.statusCommand}
2. Dis-moi en une phrase si quelque chose demande mon attention, puis, par ordre d'urgence : le travail qui peut se perdre (modifications non commitées, commits non poussés), la CI en échec, les clones en retard, les PR qui attendent.
3. Propose une ou deux suites concrètes, et attends ma réponse.

Ne modifie rien pour l'instant : pas de clone, pas de mise à jour, aucun changement dans un repo. Pour travailler dans un repo, ouvre une session dans le dossier de son clone (\`clone.path\`, donné par l'outil \`repo\`).`
