# Zeus

Suivre et piloter une flotte de repos git depuis une page locale : les repos de tes comptes GitHub,
leurs clones sur la machine, de quoi les cloner et les mettre à jour, et les outils transverses qui
vont avec.

```sh
npx @vincweb/zeus            # ouvre la page — une fois le paquet publié
```

Il lui faut Node 20 ou plus, `git`, et [`gh`](https://cli.github.com) connecté à ton compte
(`gh auth login`). Aucune dépendance à l'exécution.

Tant que le paquet n'est pas publié — `package.json` porte `"private": true`, exprès — il se lance
depuis les sources :

```sh
pnpm install && pnpm build
node dist/cli.js             # depuis le dossier de tes projets, ou n'importe où dessous
pnpm link --global           # ou : la commande `zeus`, partout sur cette machine
```

## Le modèle : un dossier parent, et rien à classer

Zeus ne demande qu'une chose : **le dossier parent** de tes projets. Tout le reste est lu là où il
vit, et rien n'est tenu à la main :

| Quoi                         | D'où ça vient                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| tes **workspaces**           | de `gh` : ton compte, et chaque organisation dont tu fais partie                                                         |
| les **repos** d'un workspace | de GitHub : ceux que ce compte possède                                                                                   |
| les **clones**               | d'un scan du dossier parent, chaque clone rattaché à son repo par son remote `origin` — jamais par le nom de son dossier |
| où va un **nouveau clone**   | dans `<dossier parent>/<compte>/<repo>` : l'organisation de GitHub, reproduite sur le disque                             |

Il n'y a donc pas de seconde organisation à garder alignée sur la première : un repo de `acme` est
dans le workspace `acme`, et s'il est au mauvais endroit, ça se corrige sur GitHub. Les clones
existants ne bougent pas — Zeus les retrouve où qu'ils soient sous le dossier parent.

### `.zeus/`

`zeus init` (ou la page, la première fois) pose un dossier `.zeus/` à la racine du dossier parent.
Il **marque** la racine : lancé dans n'importe quel sous-dossier, Zeus remonte jusqu'à lui, comme
git jusqu'à `.git`. Aucun chemin n'est donc écrit nulle part, et le même dossier fonctionne tel
quel sur une autre machine.

Il peut rester vide. `.zeus/config.json`, facultatif, ne contient que ce que personne d'autre ne
peut savoir :

```json
{
  "hiddenOwners": ["une-grosse-org"],
  "folders": { "Vincweb": "perso" },
  "tools": [
    {
      "id": "mon-outil",
      "scope": "repo",
      "run": "npx mon-outil",
      "install": { "kind": "dev-dependency", "package": "mon-outil" },
      "detect": { "dependency": "mon-outil" }
    }
  ]
}
```

- **hiddenOwners** — des comptes que `gh` voit et que ce dossier laisse de côté. Se règle aussi
  depuis la page (« Comptes suivis… »).
- **folders** — le dossier des nouveaux clones d'un compte, quand ce n'est pas le nom du compte.
- **tools** — des outils transverses en plus de ceux par défaut (code-atlas,
  claude-context-viewer) ; un outil qui reprend l'`id` d'un outil par défaut le remplace.
- **scanDepth** (3), **includeArchived** (`false`).

## Les outils transverses

Zeus liste les outils qui servent à plusieurs projets, dit où chacun est en place, et l'installe
d'un clic. Un outil a une portée (`scope`) et, pour le clic, une recette (`install`) :

| Recette                                                                                   | Ce qu'un clic lance                                                                                                         | Où          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `{ "kind": "claude-plugin", "plugin": "nom@marketplace", "marketplace": "compte/depot" }` | `claude plugin marketplace add …` puis `claude plugin install …`                                                            | Claude Code |
| `{ "kind": "npm-global", "package": "nom" }`                                              | `npm install -g nom`                                                                                                        | la machine  |
| `{ "kind": "dev-dependency", "package": "nom" }`                                          | l'ajout en dépendance de développement, avec le gestionnaire **du repo choisi** — bun, pnpm, yarn ou npm selon son lockfile | un clone    |

Une recette ne nomme qu'un paquet ou un plugin, jamais une commande : les trois formes sont fixes,
et un nom qui n'est pas qu'un nom (`--registry=…`, `a; b`) est refusé à la lecture de la config.
La page montre les commandes avant de les lancer, puis ce que chacune a répondu.

Dans un clone, l'installation est refusée s'il a des fichiers modifiés — pour que l'ajout reste
lisible — et laisse `package.json` et le lockfile modifiés, à commiter dans ce repo. Un `install`
écrit comme une simple chaîne reste une commande à copier.

Détection (`detect`) : `files` ou `dependency` dans un clone, `plugin` parmi les plugins installés
de Claude Code, `command` sur le `PATH`.

## Ce que fait Zeus — et ce qu'il ne fait pas

Zeus est un **orchestrateur**. La règle qui trace la frontière :

> Ce qui se calcule en regardant **un seul repo** appartient à l'outil de ce repo
> ([code-atlas](https://github.com/Vincweb/code-atlas) pour un projet TypeScript).
> Ce qui demande **plusieurs repos**, ou ne porte pas sur le code, appartient à Zeus.

Zeus sait donc quels repos existent, où sont leurs clones, s'ils sont en retard, ce que dit la CI,
quels outils sont en place. Il ne lit ni lockfile ni code : un score, des dépendances périmées, un
audit — c'est code-atlas qui les calcule, et Zeus qui les rassemble.

## La page

- **Accueil** — ce qu'est Zeus, les dossiers déjà suivis, et comment l'installer ailleurs. Lancé
  dans un dossier suivi (ou dessous), Zeus ouvre directement sa flotte.
- **Choisir un dossier** (`/setup`) — pour une machine qui n'a jamais vu Zeus : `git`, `gh`, le
  compte connecté, le mode de clonage ; puis le dossier parent ; puis les comptes détectés. Zeus
  constate et dit quoi lancer (`gh auth login`) : il ne connecte personne.
- **La flotte** (`/fleet?root=…`) — un onglet par workspace, six chiffres qui filtrent, le tableau
  des repos rangés par dossier, les outils, et les autres dossiers git trouvés sous la racine (sans
  remote, hors GitHub, d'un autre compte, plus listés par GitHub) avec la raison de chacun.

Un gros compte est listé tout de suite et détaillé ensuite : la CI et les PR de ses repos non
clonés arrivent quelques secondes après, sans retenir la page.

## Commandes

| Commande                               | Effet                                                |
| -------------------------------------- | ---------------------------------------------------- |
| `zeus`                                 | ouvre la page : sur ta flotte, sinon sur l'accueil   |
| `zeus init [dossier]`                  | fait d'un dossier le dossier parent (`.zeus/`)       |
| `zeus status [--workspace <compte>]`   | l'état de chaque repo, en tableau                    |
| `zeus status --json [--full]`          | le même, en un document — pour un script ou un agent |
| `zeus clone <repo> [--into <dossier>]` | clone un repo suivi, dans le dossier de son compte   |
| `zeus update <repo>…` / `--all`        | fetch, puis avance rapide là où rien ne s'y oppose   |
| `zeus install <outil> [--repo <repo>]` | installe un outil transverse                         |
| `zeus mcp`                             | sert la flotte à un agent (MCP, sur stdio)           |

`-r, --root <dir>` nomme le dossier parent ; à défaut `ZEUS_ROOT`, sinon celui qui contient
`.zeus/` en remontant depuis le dossier courant.

## Avec Claude Code

Zeus se branche à Claude Code comme serveur MCP : une session ouverte **sur le dossier parent**
connaît alors la flotte, au lieu de la reconstituer avec `git` et `gh`.

```sh
claude mcp add -s project zeus -- npx -y @vincweb/zeus mcp   # une fois le paquet publié
```

`-s project` écrit `.mcp.json` dans le dossier parent. La page donne la commande exacte tant que
ce n'est pas fait, et Claude Code demande ton accord la première fois.

| Outil     | Ce qu'il répond                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet`   | les repos suivis, une ligne chacun : workspace, chemin du clone, état, modifs en cours, CI, « prêt » ou non — par compte (`workspace`) et filtrable (`attention`, `behind`, `dirty`, `to-clone`…) |
| `repo`    | un repo en entier, et pourquoi son clone n'est pas prêt quand il ne l'est pas                                                                                                                     |
| `home`    | les workspaces, où vont leurs nouveaux clones, les outils en place, les autres dossiers git                                                                                                       |
| `update`  | fetch puis avance rapide — écrit sur le disque                                                                                                                                                    |
| `clone`   | clone un repo dans le dossier de son compte — écrit sur le disque                                                                                                                                 |
| `install` | installe un outil transverse, dans Claude Code, sur la machine ou dans un clone — écrit sur le disque                                                                                             |

Le partage des rôles : **Zeus dit où et dans quel état**, Claude Code **ouvre les conversations**.
La session du dossier parent est l'orchestratrice ; pour travailler dans un repo, elle ouvre une
session sur le `path` que Zeus lui donne, qui charge alors le `CLAUDE.md` et les outils de ce repo.
Zeus ne lance aucun agent lui-même.

Le `.mcp.json` du dossier parent est aussi vu depuis ses sous-dossiers : `claude mcp list`, lancé
dans un projet, liste le serveur `zeus` du dossier au-dessus. La commande qu'il déclare doit donc
marcher de partout — un chemin absolu, ou `npx` — et `zeus mcp` retrouve la racine en remontant.

Ne mets pas de `CLAUDE.md` d'orchestration à la racine du dossier parent : il serait chargé dans
les sessions de tous les projets en dessous. Une skill dans `.claude/skills/` n'a pas ce défaut.

## Mettre à jour, sans surprise

« Mettre à jour » fait un `git fetch --prune`, puis une avance rapide vers la branche suivie —
et seulement une avance rapide. Jamais de merge, de rebase ni de stash :

| Situation du clone                 | Ce qui se passe                         |
| ---------------------------------- | --------------------------------------- |
| propre, en retard                  | avancé jusqu'à la branche distante      |
| des fichiers suivis modifiés       | récupéré, branche laissée où elle était |
| des commits locaux **et** distants | récupéré, signalé comme divergé         |
| une branche qui ne suit rien       | récupéré, rien d'autre                  |

Des fichiers non suivis ne bloquent pas : git refuse lui-même l'avance s'ils devaient être écrasés.

Les clones se font en SSH quand GitHub reconnaît une clé sur la machine, en HTTPS sinon — git
emprunte alors la connexion de `gh`. C'est un fait de la machine : il se constate, il ne s'écrit
dans aucune config.

## Sécurité

La page peut lancer `git clone` et `git fetch` : elle n'obéit qu'à elle-même.

- Le serveur écoute sur `127.0.0.1` et ne répond qu'à `localhost` (pas de DNS rebinding).
- Une action est un `POST` en JSON, refusé à toute autre origine que la page.
- Une action ne reçoit qu'un identifiant `owner/name` : l'URL et le chemin viennent de ce que le
  serveur a lui-même lu sur GitHub et sur le disque. La destination d'un clone est le dossier du
  compte, un dossier existant, ou quelques noms simples vérifiés un à un — toujours sous la racine.
- Écarter ou suivre un compte ne nomme que des comptes que ton `gh` a listés.
- Aucun shell, aucune invite : une commande qui demanderait un mot de passe échoue au lieu d'attendre.
- Installer un outil ne nomme qu'un outil et, au plus, un repo : ce qui tourne est la recette que
  le serveur tient pour cet outil, dans un clone qu'il a lui-même trouvé.
- Zeus ne garde aucun jeton, ne crée aucun dépôt et ne pousse rien.

## Publier

Même circuit que code-atlas : un tag `v*` lance `.github/workflows/release.yml`, qui vérifie,
empaquette, crée la release GitHub avec l'archive, puis publie sur npm sans jeton (publication de
confiance, à configurer une fois sur npmjs.com pour ce dépôt).

L'archive se lance déjà sans registre : `npx <URL de l'archive>`, ou
`npx --package <archive> zeus`.

Avant le premier tag, il reste à :

- **arrêter le nom du paquet.** Un scope n'a qu'un registre par machine : là où `~/.npmrc` envoie
  `@vincweb` vers GitHub Packages, `npx @vincweb/zeus` cherchera au mauvais endroit, à moins
  d'ajouter `--@vincweb:registry=https://registry.npmjs.org`. Un nom sans scope n'a pas ce défaut ;
- **retirer `"private": true`** de `package.json`, qui est le seul garde-fou : un nom publié l'est
  pour de bon ;
- **décider si le dépôt devient public.** npm ne produit la provenance que pour un dépôt public :
  s'il reste privé, retirer `--provenance` du workflow.

## Licence

MIT.

## Développement

```sh
pnpm dev --root ..     # API sur :4900 avec rechargement, page sur :4901
pnpm check             # lint, types, tests, build
```

Même squelette que claude-context-viewer et code-atlas : serveur `http` de Node sans dépendance,
page React + Vite + Tailwind, `tsup` pour la CLI, `node:test` pour les tests.

## Et ensuite

- lancer `code-atlas --check --format json` sur chaque repo et afficher les scores ;
- les services autour des repos : déploiements, quotas ;
- un bilan « prêt à changer de machine » : ce qui n'est pas encore sur GitHub.
