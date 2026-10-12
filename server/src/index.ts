import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ProgressStore } from './progress.js';
import { World } from './world.js';
import { WorldRoom } from './WorldRoom.js';
import { ArenaRoom } from './ArenaRoom.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const port = Number(process.env.PORT ?? 2567);
const worldPath = process.env.WORLD_JSON ?? here('../../client/public/world.json');
const resultsPath = process.env.ASSAY_RESULTS ?? here('../data/assay-results.json');
const progressPath = process.env.PROGRESS_JSON ?? here('../data/progress.json');

WorldRoom.world = new World(worldPath);
WorldRoom.store = new ProgressStore(progressPath);
WorldRoom.labSpeed = Math.max(0.1, Number(process.env.LAB_SPEED ?? 1) || 1);
if (existsSync(resultsPath)) {
  const r = JSON.parse(readFileSync(resultsPath, 'utf8')) as Record<string, unknown>;
  WorldRoom.results = Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
}
console.log(`[server] world ${worldPath}: ${WorldRoom.world.W}x${WorldRoom.world.H}, ${WorldRoom.world.spawns.length} spawn tiles`);
console.log(`[server] progress ${progressPath}: ${Object.keys(WorldRoom.store.data.players).length} known players`);

const server = new Server({ transport: new WebSocketTransport() });
server.define('world', WorldRoom);
server.define('arena', ArenaRoom);
await server.listen(port);
console.log(`[server] listening on ws://localhost:${port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    WorldRoom.store.flush();
    process.exit(0);
  });
}
