# Client

A Zelda-style, multiplayer overworld of chemical space, built with Phaser 3,
Vite, RDKit.js and colyseus.js. The world comes from `public/world.json`, which
`pipeline/build_world.py` writes. Multiplayer needs `server/` running; without
it, the game plays solo, so the static build still works on GitHub Pages.

Players create a hero on the title screen. Each class maps to a lab role:
Wizard = CADD scientist, Warrior = synthetic chemist, Ranger = medicinal
chemist, Healer = purification, Paladin = biologist/assay scientist,
Bard = project leader. All art is procedural (`src/gfx/`); there are no asset files.

Grey (untested) crystals can be voted on: ⚒ synthesise or ✋ skip. Approved
crystals are made and assayed, and XP goes to players whose call was right. See
`docs/council-and-progression.md`.

Crystals glow in their potency colour (pIC50 ramp, red to teal). Grey crystals
with a "?" are untested. The demo potencies are illustrative, not literature
values.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (relative paths; works on GitHub Pages)
npm run preview    # serve dist/ locally
```

If `public/world.json` is missing, the client falls back to
`public/world.mock.json` (hand-made placeholder data) and shows a "mock data"
badge. `npm run copy-rdkit` (run automatically before dev/build) copies the
RDKit WASM into `public/rdkit/`.

## Controls

| Key | Action |
|-----|--------|
| Arrows / WASD | walk (one tile per step) |
| Space / Enter | inspect the compound you face |
| Click a crystal | inspect it from anywhere |
| T | audit mode: lines to each compound's 3 most similar compounds, plus honesty metrics |
| C | character sheet: level, XP, skills, calibration |
| Q | quest log: propose, back or doubt hypotheses, add evidence notes |
| H | help |
| Esc | close card |

## Layout

```
src/main.ts               boot: hero creation, connect, start Phaser
src/net/session.ts        Colyseus connection + state callbacks
src/net/council.ts        client mirror of crystal states, votes, hypotheses, own XP
src/ui/quests.ts          quest log + propose form
src/scenes/ArenaScene.ts  arena realm: combat, projectiles, effects (launched from the world portal)
src/net/arenaSession.ts   connection to the arena room
src/ui/arenaHud.ts        HP/cooldown bars, glory scoreboard, combat feed
src/gfx/arenaTextures.ts  arena tiles, pillars, braziers, portal, projectiles
../shared/rules.ts        XP curve, quorum, skills (shared with the server)
src/ui/creator.ts         title screen / character creator
src/gfx/characters.ts     procedural hero sprites per class
src/gfx/activity.ts       potency colour ramp
src/scenes/WorldScene.ts  world rendering, movement + prediction, other players, minimap
src/world/                world.json types, loader, collision rules
src/gfx/textures.ts       terrain, shores, roads, bridges, decorations
src/ui/card.ts            compound card (DOM overlay)
src/ui/hud.ts             region label, hints, help/audit panels
src/ui/audit.ts           similarity lines + metrics panel
src/ui/rdkit.ts           RDKit.js loader + SVG depiction
```
