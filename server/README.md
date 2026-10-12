# Server

Authoritative multiplayer server (Colyseus 0.16). One shared `world` room. It
loads the same `world.json` as the client and validates every step against
water, compound pedestals and blocking decorations, so clients can't walk
through trees or teleport. It also runs the synthesis council (votes,
synthesis and assay timers, result reveal) and awards XP for correct calls.

```bash
npm install
npm run dev        # ws://localhost:2567, restarts on change
npm start          # same, without watch
```

Env vars:

| var | default | |
|---|---|---|
| `PORT` | 2567 | |
| `WORLD_JSON` | `../client/public/world.json` | map + compounds |
| `ASSAY_RESULTS` | `data/assay-results.json` | hidden results revealed after synthesis (illustrative demo values) |
| `PROGRESS_JSON` | `data/progress.json` | XP, votes, lab state (gitignored) |
| `LAB_SPEED` | 1 | e.g. `10` makes synthesis + assay take 6 s instead of 60 s, for demos |

`npm run reset` deletes `data/progress.json`, which wipes all XP, votes and
lab state. Stop the server first.

The synthesis council, lab loop and XP rules are described in
[`docs/council-and-progression.md`](../docs/council-and-progression.md); the
numbers live in [`shared/rules.ts`](../shared/rules.ts), imported by both
client and server.

The client connects to `ws://<page host>:2567`, or to `VITE_SERVER_URL` if that
is set at build time. If no server answers within 4 s, the game runs solo.

## Arena room (`arena`)

A separate, free-for-all room reached through the portal in the world. All
combat is simulated here (50 ms ticks): movement (players block each other),
cooldowns, projectiles, specials, knockouts and respawns. Class stats and
abilities live in [`shared/arena.ts`](../shared/arena.ts). Arena results are
never saved and never award XP.

| client → server | payload | |
|---|---|---|
| join options | `{name, cls, tunic, skin, hair, level}` | level is cosmetic |
| `move` / `face` | `{dir}` | rejected while stunned or knocked out |
| `attack` | `{dir}` | melee hits the facing tile; ranged spawns a projectile |
| `special` | `{dir}` | class special, server-side cooldown |

Server → client: state `fighters` (hp, KOs, cooldown and status timestamps) and
`shots`; `fx` (hit, slash, nova, heal…), `ko`, `reject`, `exit` (stepped on the
exit portal).

## Protocol (world room)

| client → server | payload | effect |
|---|---|---|
| join options | `{name, cls, tunic, skin, hair}` | sanitised; bad values fall back to defaults |
| `move` | `{dir}` 0 down, 1 left, 2 right, 3 up | one tile; rate-limited (token bucket, 1 step / 135 ms, burst 3) |
| `face` | `{dir}` | turn without moving |
| `reading` | `{id}` | compound card open (`''` = closed); shown as 📜 to others |
| `vote` | `{id, choice}` `'for'`, `'against'` or `'none'` | only on untested crystals; locks once approved |
| `insight` | `{id}` | skill-gated private info (Foresight, Early readout) |
| `clock` | | server replies with its time, for progress bars |
| `propose` | `{statement, claim, crystals}` | new hypothesis; replies `propose-result {ok, id \| error}` |
| `stance` | `{id, stance}` `'believe'`, `'doubt'` or `'none'` | locks once evidence arrives |
| `note` | `{id, text}` | evidence note, ≤ 200 chars, 1 per 5 s |
| `abandon` | `{id}` | author only, before any result |

| server → client | |
|---|---|
| state `players` map | pid, name, class, colours, x, y, dir, reading, xp, level, calls, correct |
| state `crystals` map | status, phase start/end, revealed pIC50, votes (by pid) |
| state `hypotheses` map | statement, claim, crystals, land, author, status, stances, notes |
| `quest` | `{id, event, text}`: proposed / supported / refuted (broadcast) |
| `xp` | `{gain, reason, xp, level, leveledUp}` (to the player concerned) |
| `reveal` / `council` | result revealed / crystal approved (broadcast) |
| `insight` / `clock` | replies |
| `reject` `{x, y, dir}` | refused move; the client snaps back |
