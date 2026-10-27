# LOMÉ RUNNER — Spécification visuelle des écrans (maquette V3, vue de derrière)

Document destiné à l'agent de codage. **Objectif : reproduire les trois écrans à l'identique de la maquette.** Les valeurs ci-dessous sont exactes (px CSS, hexadécimal). Ne rien inventer : si un détail manque, le signaler plutôt que le deviner.

Fichiers fournis avec ce document : `assets/*.svg` (sprites vectoriels), et les captures d'écran des trois artboards « V3 » (à joindre séparément).

---

## 1. Principes généraux

- **Format :** mobile portrait, zone de jeu logique **390 × 844 px**. Sur ordinateur, la zone est centrée et conserve ce ratio (mode FIT de Phaser).
- **Police :** `Baloo 2` (Google Fonts), graisses **600** et **800**, repli `system-ui, sans-serif`. Pour le mode hors ligne, héberger la police localement.
- **Langue :** français. Les textes sont ceux indiqués, en majuscules lorsque précisé.
- **Vue :** caméra **derrière le coureur** (troisième personne), route en perspective qui fuit vers l'horizon. Plus d'objet = plus loin = plus petit et plus haut sur l'écran.
- **Éléments tactiles :** hauteur minimale 44 px (tous les boutons ci-dessous la respectent).

### Palette

| Nom | Hex | Usage |
|---|---|---|
| Bitume | `#3B3A38` | Chaussée |
| Latérite | `#B5532F` | Sol de chaque côté de la route |
| Crème | `#F1E3C6` | Texte clair, boutons clairs, tirets de voie, carte Game Over |
| Nuit | `#181614` | Voiles, fonds de pastilles, texte sombre |
| Ocre | `#F4B400` | Accent, pièces, short du coureur, « RUNNER » |
| Rouge brique | `#B3261E` | Boutons principaux, mot « COLLISION ! » |
| Vert | `#2F7D4F` | Maillot du coureur, feuillage |
| Vert foncé | `#1F6B42` | Pastille « Record » |
| Ciel | `#7CC8E8` et `#D6EEF4` | Ciel et bande de brume |
| Bord de trottoir | `#D9D2C3` | Lignes de bord de chaussée |

**Pastille sombre (PILL)** utilisée dans les écrans : fond `rgba(24,22,20,.72)`, rayon 16 px, texte crème.

---

## 2. La scène en perspective (commune aux 3 écrans)

La scène est un SVG plein écran 390 × 844, placé en fond (`position:absolute; left:0; top:0`).

### 2.1 Fond, de haut en bas
1. **Ciel :** dégradé vertical `#4FA9D9 → #BFE6F2` sur `0,0 → 390×250`. Soleil : cercle `cx=310 cy=170 r=24` `#FFE08A` avec deux halos (r 40 et 64, opacités .22 et .12). Trois nuages « gonflés » (trois ellipses blanches opacité .88 chacun) qui dérivent lentement.
2. **Horizon / bâtiments** (bas à y=250, rectangles) — `x, largeur, hauteur, couleur` :
   `0,40,50,#9FB4C0` · `36,34,80,#E8C86A` · `70,44,60,#B5532F` · `144,36,46,#E8C86A` · `220,30,70,#B5532F` · `250,40,92,#9FB4C0` · `290,36,56,#E8C86A` · `326,64,70,#8E9AA3`. Chaque bâtiment a une bande d'ombre à droite et des fenêtres `#26323C` opacité .35. **Tour de l'Hôtel du 2 Février** en `x=118`, 28 × 148, avec couronne et antenne. Palmiers lointains (`palmier.svg` teinté `#8FAE9C`) à l'horizon, puis bande de brume `#D6EEF4` opacité .55 sur les 40 px du bas.
3. **Sol latérite :** dégradé `#C2714A` (horizon) → `#B5532F` (bas d'écran).
4. **Trottoirs :** de chaque côté, bande `#CBBCA2` entre la bordure et `bord + 4,5 + 43·k`, avec des joints qui défilent.
5. **Chaussée :** 16 bandes horizontales du gris brumeux `#77716B` (horizon) au bitume `#3B3A38` (bas). Lignes de rive crème continues à `±1,38·L(k)`.
6. **Bordures :** blocs alternés rouge brique `#B3261E` / crème de largeur `1,5 + 9·k`, sur le bord de la chaussée.
7. **Brume au sol :** dégradé `#D6EEF4` opacité .55 → 0 sur les 80 px sous l'horizon, au-dessus de la route mais sous les objets.

### 2.2 Formules de perspective
Soit `k` la profondeur de 0 (horizon) à 1 (bas d'écran).

- `y = 250 + 594·k`
- `L(k) = 13.3 + 123.3·k` (écart entre deux voies à cette profondeur)
- `x = 195 + voie·L(k)` avec `voie ∈ {-1, 0, +1}` (gauche, centre, droite)
- `échelle = L(k) / 136.7`
- Largeur de la route à la profondeur k : `40 + 370·k`

### 2.3 Tirets de séparation des voies
Deux lignes aux positions `voie = ±0,5`. Les tirets sont des quadrilatères crème `#F1E3C6` opacité .9 (atténués près de l'horizon), longs de 0,06 en profondeur et répétés tous les 0,12. Demi-largeur : `0,6 + 2,6·k`.

Tout ce qui est peint au sol (tirets, bordures, joints de trottoir, rustines, plaques d'égout, fissures, taches d'huile) défile à la **même vitesse que les obstacles**, pour que le sol ne semble jamais glisser sous eux.

### 2.4 Objets de la scène (origine du sprite = centre bas)
Chaque sprite SVG a son origine au **centre du bas** (pieds / roues au sol, y = 0 vers le haut négatif). On le place avec `translate(x y) scale(s)` calculés par les formules ci-dessus. **Ordre de dessin : du plus loin (k petit) au plus proche (k grand).**

| Objet | Fichier | Voie | k | Échelle |
|---|---|---|---|---|
| Zémidjan | `zemidjan.svg` | +1 (droite) | 0,30 | formule |
| Minibus taxi-brousse | `minibus.svg` | −1 (gauche) | 0,38 | formule |
| Taxi | `taxi.svg` | +1 | 0,50 | formule |
| Étal de marché | `etal-marche.svg` | 0 | 0,62 | formule |
| Chantier (cônes + barrière) | `chantier-cones.svg` | +1 | 0,72 | formule |
| Pièces (3) | `piece.svg` | 0 | 0,30 / 0,37 / 0,44 | formule |
| Pièce (1) | `piece.svg` | −1 | 0,80 | formule |
| **Coureur** | `runner.svg` | 0 (centre) | **0,93** | **0,82 fixe** |

Décor latéral (même principe, `edge = 20 + 185·k`, `s` = échelle de la profondeur) :
- Palmiers `palmier.svg` : k = 0,18 / 0,35 / 0,55 / 0,80, de chaque côté, `x = 195 ± (edge + 54,4·s)`, échelle `1,1·s`.
- Maisons `maison.svg` et boutiques `boutique.svg` en alternance : k = 0,28 / 0,50 / 0,75, de chaque côté, `x = 195 ± (edge + 110,5·s)`, échelle `s`.

> Dans le jeu réel, ces objets se déplacent : `k` augmente avec la vitesse, l'objet grossit et descend. Le coureur reste fixe à `k = 0,93`.

### 2.5 Sprites fournis
`public/assets/` contient 14 SVG :
- Coureur : `runner`.
- Obstacles à éviter en changeant de voie : `zemidjan`, `taxi`, `berline`, `tricycle` (chargé de bidons jaunes), `pickup` (chargé de sacs), `minibus` (taxi-brousse, bagages sur le toit, bande aux couleurs du Togo), `etal-marche`.
- Obstacle à sauter : `chantier-cones`. Obstacle sous lequel glisser : `portique`.
- Décor et bonus : `piece`, `palmier`, `maison`, `boutique`.

Les véhicules sont vus de l'arrière (feux rouges, plaque « TG »). Ils ne dépassent pas 132 px de large, soit la largeur d'une voie au niveau du coureur.

Le coureur : peau `#7A4B2A`, cheveux `#1A120D`, maillot `#2F7D4F` avec bande `#F1E3C6`, short `#F4B400`, baskets `#C62828`. **Ne pas modifier le personnage.**

---

## 3. Écran 1 — Menu

**Construction :** scène (section 2) + voile `#181614` opacité **.55** couvrant tout l'écran + contenu.

**Conteneur du contenu :** colonne flex plein écran, padding `96px 32px 40px`, `gap:14px`.

De haut en bas :
1. **Étiquette** « LOMÉ · TOGO » : centrée, contour 2 px `#F4B400`, rayon 20, padding `2px 14px`, 14 px, graisse 600, espacement des lettres 2 px, texte `#F4B400`.
2. **Titre** : « LOMÉ » puis retour à la ligne puis « RUNNER ». Centré, 72 px, interligne .9, graisse 800, marge haute 60 px, couleur crème, ombre `0 4px 0 #181614`. « RUNNER » en `#F4B400`.
3. **Slogan** « Cours. Esquive. Bats ton record. » : centré, 18 px, graisse 600, marge haute 6, PILL, padding `4px 8px`.
4. **Bloc du bas** (poussé en bas : `margin-top:auto`, `padding-bottom:20px`, colonne, `gap:12px`) :
   - Pastille « Meilleur score : 3 482 m » : centrée, 16 px, graisse 600, PILL, padding 4 px. *(La valeur vient de la sauvegarde locale.)*
   - Bouton **JOUER** : pleine largeur, hauteur 60, rayon 18, 24 px, graisse 800, fond `#B3261E`, texte crème, sans bordure.
   - Ligne (flex, `gap:12px`) : bouton **Instructions** (flex 1, hauteur 48, 18 px, graisse 800, fond crème, texte `#181614`, rayon 18) et bouton **Son** (largeur 64, hauteur 48, mêmes styles, `aria-label="Son activé"`).

---

## 4. Écran 2 — Jeu (HUD)

**Construction :** scène (section 2) + barre HUD, sans voile.

**HUD :** ligne flex, `justify-content:space-between`, `align-items:center`, padding `52px 16px 0` (le 52 tient compte de la zone sûre en haut sur mobile).

De gauche à droite :
1. **Pastille distance** (PILL, padding `4px 16px`) : libellé « DISTANCE » 12 px, graisse 600, espacement 1 px ; valeur « 1 240 m » 32 px, graisse 800, interligne 1. *(Séparateur des milliers : espace.)*
2. **Pastille pièces** (PILL, flex, `gap:8px`, padding `8px 16px`) : disque `#F4B400` de 24 px + nombre « 37 », 26 px, graisse 800.
3. **Bouton pause** : 48 × 48, rayon 14, fond crème, texte « II » 22 px graisse 800 couleur `#181614`, `aria-label="Pause"`.

---

## 5. Écran 3 — Game Over

**Construction :** scène + voile `#181614` opacité **.78** + carte.

**Carte :** position absolue `left:28px; top:170px; width:334px`, fond crème, texte `#181614`, rayon 28, padding `32px 24px`, colonne flex, `gap:14px`, texte centré.
1. « COLLISION ! » : 18 px, graisse 800, `#B3261E`, espacement 2 px.
2. « Distance parcourue » : 16 px, graisse 600.
3. Valeur « 1 240 m » : 64 px, graisse 800, interligne .9.
4. Deux cartes côte à côte (`gap:12px`, chacune flex 1, rayon 16, padding 8) :
   - **Pièces** : fond `#F4B400`, texte sombre ; libellé 14 px graisse 600, valeur « 37 » 28 px graisse 800.
   - **Record** : fond `#1F6B42`, texte crème ; libellé « Record », valeur « 3 482 m ».
5. Bouton **REJOUER** : hauteur 60, rayon 18, 24 px, graisse 800, fond `#B3261E`, texte crème, marge haute 8.
6. Bouton **Menu** : hauteur 48, rayon 18, 18 px, graisse 800, fond `#181614`, texte crème.

*Variante à prévoir :* si la partie bat le record, remplacer « Record » par « Nouveau record ! » (texte à valider).

---

## 6. Ce qui n'est pas encore dessiné

L'écran **Pause**, l'écran **Instructions** et le **compte à rebours 3-2-1** n'existent pas dans la maquette. Les réaliser avec le même langage visuel (voile Nuit, carte crème, boutons rouge brique / crème, police Baloo 2) et signaler ce choix.

## 7. Recommandations de mise en œuvre

- **React** : Menu, Instructions, Pause, Game Over. **Phaser** : scène de course et, de préférence, le HUD.
- Les sprites SVG peuvent être chargés tels quels dans Phaser, ou convertis en PNG (par exemple 2 × la taille d'affichage) pour de meilleures performances sur mobiles modestes.
- Animations suggérées (non montrées dans la maquette) : changement de voie ≈ 120 ms ; légère bascule du coureur en course ; pièces qui tournent. À valider avant d'ajouter.
- Contrastes : texte crème sur rouge brique et sur vert foncé, texte sombre sur ocre et sur crème : conserver ces couples.
- Constantes de perspective (horizon 250, `k` du coureur 0,93, formules de la section 2.2) à placer dans `game/config.js`.

## 8. Contrôle de conformité (avant livraison)

- [ ] Les trois écrans sont identiques aux captures, à 390 × 844.
- [ ] Même palette, même police, mêmes tailles de texte.
- [ ] Le coureur est vu de dos, à `k = 0,93`, voie centrale, inchangé.
- [ ] Les objets grossissent en s'approchant, ordre de dessin du fond vers l'avant.
- [ ] Boutons ≥ 44 px, `aria-label` sur Pause et Son.
- [ ] Aucune ressource externe nécessaire hors ligne (police incluse localement).
