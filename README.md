# Lomé Runner

Jeu endless runner 2D inspiré de Lomé, construit avec React, Phaser, Vite et PWA.

## Phase 0 — initialisation

Le projet contient le squelette Vite + React + Phaser, la configuration PWA initiale,
les références de conception et les assets SVG dans `public/assets/`. La Phase 1 ajoute
la scène Phaser : ciel, horizon, route en perspective, tirets, décors latéraux,
obstacles, pièces et coureur fixe. La Phase 2 ajoute le défilement de la profondeur,
le changement de voie clavier/tactile en 120 ms, une file d'une commande et la pause
automatique quand l'onglet devient invisible.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

## Vérifications

```bash
npm run lint
npm run build
npm run preview
```

## Structure

```text
public/assets/  sprites SVG fournis
docs/           cahier des charges, design et compte rendu
src/game/       scène Phaser et formules de perspective
src/hooks/      cycle de vie React ↔ Phaser
src/            application React et moteur Phaser
vite.config.js  Vite, React et PWA
```

## Déploiement Vercel

Le projet est une application statique Vite. Vercel peut utiliser les valeurs par
défaut : commande `npm run build`, sortie `dist`, aucune variable d'environnement.
## Phase 3 — gameplay de base

Les pools réutilisables d'obstacles et de pièces sont alimentés par un spawner qui
laisse toujours au moins une voie libre. Les collisions terminent la partie, les
pièces sont collectées et la distance progresse avec la vitesse.
## Phase 4 — interface

Le menu, les instructions, la pause, le HUD, le compte à rebours et l'écran Game Over
sont maintenant rendus par React autour de la scène Phaser. Le cycle Rejouer/Menu
recrée proprement la partie.
## Finitions PWA et audio

L'audio est généré localement avec Web Audio API après la première interaction.
Le manifeste référence les icônes locales et le service worker pré-cache les assets SVG.
## Tests logiques

```bash
npm run test:logic
```

Cette vérification couvre les points de fuite, les limites verticales et la symétrie
des voies.
## Déploiement Vercel

`vercel.json` configure le build Vite, la sortie `dist` et le fallback de navigation
vers `index.html`.
