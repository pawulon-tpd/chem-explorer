import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { fileURLToPath } from 'node:url';
import { World } from './world.js';
import { WorldRoom } from './WorldRoom.js';

const port = Number(process.env.PORT ?? 2567);
const worldPath = process.env.WORLD_JSON ?? fileURLToPath(new URL('../../client/public/world.json', import.meta.url));

WorldRoom.world = new World(worldPath);
console.log(`[server] world ${worldPath}: ${WorldRoom.world.W}x${WorldRoom.world.H}, ${WorldRoom.world.spawns.length} spawn tiles`);

const server = new Server({ transport: new WebSocketTransport() });
server.define('world', WorldRoom);
await server.listen(port);
console.log(`[server] listening on ws://localhost:${port}`);
