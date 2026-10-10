# Server

Authoritative multiplayer server (Colyseus 0.16). One shared `world` room. It
loads the same `world.json` as the client and validates every step against
water, compound pedestals and blocking decorations, so clients can't walk
through trees or teleport.

```bash
npm install
npm run dev        # ws://localhost:2567, restarts on change
npm start          # same, without watch
```

Env vars: `PORT` (default 2567) and `WORLD_JSON` (default
`../client/public/world.json`).

The client connects to `ws://<page host>:2567`, or to `VITE_SERVER_URL` if that
is set at build time. If no server answers within 4 s, the game runs solo.

## Protocol

| client → server | payload | effect |
|---|---|---|
| join options | `{name, cls, tunic, skin, hair}` | sanitised; bad values fall back to defaults |
| `move` | `{dir}` 0 down, 1 left, 2 right, 3 up | one tile; rate-limited (token bucket, 1 step / 135 ms, burst 3) |
| `face` | `{dir}` | turn without moving |
| `reading` | `{id}` | compound card open (`''` = closed); shown as 📜 to others |

| server → client | |
|---|---|
| state `players` map | name, class, colours, x, y, dir, reading |
| `reject` `{x, y, dir}` | refused move; the client snaps back |
