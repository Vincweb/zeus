# Zeus

Orchestrateur d'une flotte de repos git : état, clone / mise à jour, outils transverses.
Une CLI Node, une page locale, un serveur MCP. Voir `README.md` pour l'usage.

## Le modèle — à ne pas compliquer

Un **dossier parent** (celui qui contient `.zeus/`), et c'est tout ce qui se choisit. Le reste se
lit là où il vit : les **workspaces** sont les comptes GitHub que `gh` voit (toi, tes
organisations), les **repos** sont ceux que GitHub liste pour eux, les **clones** sortent d'un scan
et se rattachent à leur repo par leur remote. Un nouveau clone va dans `<racine>/<compte>/<repo>`.

- **Pas de seconde organisation.** Rien ne classe un repo dans un workspace à part GitHub. Pas de
  familles, pas de notes, pas de registre à la main : tout ce qui demanderait d'être tenu à jour
  finit périmé. Avant d'ajouter une clé à `.zeus/config.json`, se demander si l'information
  n'existe pas déjà quelque part où elle se lit.
- **Aucun chemin absolu enregistré.** La racine se trouve en remontant depuis le dossier courant
  (`findHome`). Ce qui dépend de la machine (SSH ou HTTPS, les clones présents) se constate à
  chaque lecture et ne s'écrit dans aucune config.
- **Ne rien coder en dur pour un compte.** L'outil sert une flotte perso comme celle d'une
  organisation de deux cents repos : pas d'hypothèse « tout est cloné », ni « tout tient en une
  requête ».

## Frontière — à ne pas franchir

Zeus **orchestre**, il n'analyse pas un projet. Ce qui se calcule en regardant un seul repo
(score, dépendances périmées, failles, audit IA) appartient à l'outil de ce repo — `code-atlas`
pour un projet TypeScript. Zeus le lance et rassemble ses résultats ; il ne lit ni lockfile ni
code. Avant d'ajouter une lecture « par repo » ici, se demander si elle n'a pas sa place là-bas.

Zeus **ne coordonne pas d'agents** non plus. Claude Code le fait (sessions, fils d'un projet) ;
Zeus lui répond par `zeus mcp` : où sont les clones, dans quel état, lesquels sont prêts. Tout ce
que la page sait doit pouvoir se demander par un outil MCP.

## Commandes

```sh
pnpm dev --root ..     # API :4900 (tsx watch) + page :4901 (Vite), sur le dossier au-dessus
pnpm check             # lint + types + tests + build — avant de rendre la main
pnpm test              # node:test, fichiers *.test.ts à côté du code
pnpm format            # Prettier
```

## Structure

```text
src/cli.ts              commandes : (page) · init · status · clone · update · mcp
src/shared/types.ts     le contrat entre serveur et page
src/shared/routes.ts    les URL de la page : `/`, `/fleet?root=…&workspace=…`, `/setup`
src/server/
  home.ts               le dossier parent : `.zeus/`, sa recherche, sa config facultative
  machine.ts            ce que la machine a : git, gh, compte, SSH ; les comptes (workspaces)
  github.ts             liste des repos d'un compte, puis leurs détails par petits lots
  local.ts              recherche des clones, lecture de `git status`
  status.ts             le rapprochement GitHub ↔ clones ; ce qui est détaillé tout de suite ou après
  actions.ts            clone, mise à jour (fetch + avance rapide)
  setup.ts              faire d'un dossier un dossier parent
  tools.ts              où chaque outil est en place
  install.ts            les recettes d'installation : lecture, plan, exécution, mise à jour, lancement
  terminal.ts           ouvrir Terminal sur un outil (macOS)
  atlas.ts              le score que code-atlas a enregistré dans un clone
  journal.ts            ce que le serveur de la page a fait : ses lignes, les actions, les outils lancés
  versions.ts           les outils de la machine, Claude Code et Zeus lui-même sont-ils à jour
  selfCommand.ts        la commande qui relance ce Zeus, pour un prompt donné à un agent
  mcp/                  `zeus mcp` : index (protocole stdio), tools (catalogue), calls (réponses)
  host.ts               qui a le droit de lire, qui a le droit d'agir
  server.ts             les routes /api et la page
src/client/             la page (React, TanStack Query, Tailwind v4)
  router.ts             l'écran courant, lu dans l'URL
  recent.ts             les dossiers déjà ouverts (localStorage — un confort, rien de plus)
  components/Welcome    l'accueil : choisir un dossier, installer Zeus ailleurs
  components/Setup      choisir le dossier parent, sur une machine qui n'a jamais vu Zeus
  components/Opening    l'écran pendant la lecture d'une flotte
  components/Dashboard  une flotte : onglets par compte, repos, actions, outils
  components/TerminalSheet  le terminal de Zeus : le journal du serveur (Console), qui monte du bas
  components/Footer     la fin de page : version, liens
  components/ZeusUpdate une version plus récente de Zeus : laquelle, la commande qui la prend
```

## Règles

- **Code en anglais, texte visible en français** (page, messages de la CLI, erreurs montrées).
  Les descriptions des outils MCP sont en anglais : c'est un agent qui les lit.
- **Le README est en anglais**, comme ceux de code-atlas et de claude-context-viewer : c'est la
  page du paquet sur npm. Ses images (`docs/media`) sortent de `pnpm readme:images`, qui lance le
  vrai Zeus sur une flotte inventée (`scripts/demo-fleet.ts`) — jamais de capture d'une vraie flotte.
- **Lire n'écrit rien.** `status` ne fait ni fetch ni écriture ; « en retard » se juge sur le
  commit de tête de la branche par défaut que GitHub annonce, comparé à ce que le clone contient.
- **GitHub coûte cher à interroger.** La liste d'un compte (noms, drapeaux) est rapide ; le détail
  (branche par défaut, CI, PR) ne l'est pas — sur deux cents repos, le demander d'un bloc expire.
  D'où les deux passes de `github.ts`, et `pendingDetails` : ne rien ajouter à la requête `LIST`
  sans la chronométrer sur une grosse organisation.
- **Une action ne reçoit qu'un `owner/name`.** URL et chemins viennent du statut que le serveur a
  lui-même collecté, jamais de la requête. Toute nouvelle action passe par `mayAct` (`host.ts`).
- **Mettre à jour n'avance que tout droit** : fetch puis `merge --ff-only`. Jamais de merge, de
  rebase, de stash, de reset.
- **Pas de shell, pas d'invite** : tout passe par `exec` (`execFile`, délai, invites coupées).
  Une seule exception, voulue : l'icône de terminal d'un outil ouvre Terminal (macOS) sur une
  ligne que l'utilisateur voit tourner et peut arrêter (`terminal.ts`). Le dossier et les mots y
  arrivent en arguments, cités par AppleScript (`quoted form of`), jamais collés dans le script.
- **Un outil lancé de la page tourne sous le serveur** (`journal.ts`) : `spawn` sans shell ni
  stdin, dans son propre groupe de processus, sa sortie gardée (bornée) pour la console. Il
  s'arrête d'un clic ou avec le serveur, jamais après. Claude Code ne se lance ni là ni dans
  Terminal : il est invité, jamais lancé — « Piloter avec Claude » ouvre une session dans l'app.
- **Le journal n'écrit que pour la page.** Seules les commandes d'une action y entrent (pas les
  lectures d'un statut), et rien de ce que partagent la CLI et `zeus mcp` n'imprime : leur sortie
  est la leur. Il vit en mémoire et part avec le serveur ; le processus MCP ne le voit pas.
- **Une config ne nomme jamais une commande.** Ce qu'un clic lance vient d'un petit nombre de
  formes fixes (`InstallRecipe`) ; la config n'y met qu'un nom de paquet ou de plugin, validé à la
  lecture. Une nouvelle sorte d'installation est une nouvelle forme dans `install.ts`, pas un champ
  libre. Dans un clone, on n'installe que s'il est propre, et on dit ce qui reste à commiter. Ce
  que « Lancer » tape se déduit aussi de la recette (`launchOf`) : le `run` d'une config est
  seulement montré, à copier.
- **Zeus rassemble les résultats d'un outil, il ne les calcule pas** : le score d'un clone est celui
  que code-atlas a enregistré (`.code-atlas/baseline.json`, sa référence), lu tel quel (`atlas.ts`)
  — un fichier absent ou d'une autre forme ne donne aucun score.
- **« À jour » ne vaut que pour la machine, Claude Code et Zeus lui-même** (`versions.ts`, à part
  du statut : npm et GitHub sont interrogés). La version d'un outil dans un projet relève des
  dépendances de ce projet — voir « Frontière ». Zeus ne se remplace jamais : il montre la commande
  qui prend sa dernière version (`upgradeAt`), et c'est à l'utilisateur de le relancer.
- **Aucun jeton stocké**, rien d'écrit sur GitHub : Zeus lit avec le `gh` de l'utilisateur,
  constate, et montre la commande (`gh auth login`) quand il manque quelque chose.
- **Claude est invité, jamais lancé** : un prompt ouvert dans l'app, rempli et non envoyé
  (`claudeLink`), ou copié.
- **La CLI ne force pas sa sortie** (`process.exitCode`, pas `process.exit`) : un état de 200 Ko lu
  à travers un tube serait tronqué.
- **Pas de dépendance à l'exécution** : la CLI publiée n'embarque que du Node.
- Les actions se testent sur des repos jetables (`actions.test.ts`), jamais sur de vrais clones.

## Ce qui reste à faire

- **Une idée pour plus tard devient une issue GitHub** (`gh issue create --repo Vincweb/zeus`) :
  une amélioration suggérée, un défaut repéré en passant, un point remis à plus tard. Pas de fichier
  de roadmap ni de TODO dans le code : ils vieillissent, une issue se ferme avec le PR qui la règle.
  Avant d'en ouvrir une, `gh issue list` pour ne pas la doubler.
- **Le repo est public** : une issue décrit le problème avec une flotte inventée. Elle ne nomme ni
  compte, ni organisation, ni repo de la vraie flotte de quelqu'un, et n'en donne pas les chiffres.
- Une issue est rédigée en français, comme les commits : le constat, ce qui est proposé, et ce dont
  elle dépend si ce n'est pas encore sur `main`.
