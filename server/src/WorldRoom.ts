import { Client, Room } from '@colyseus/core';
import { Player, WorldState } from './state.js';
import { World } from './world.js';

const CLASSES = ['wizard', 'warrior', 'ranger', 'healer', 'paladin', 'bard'];
const LIMITS = { tunic: 8, skin: 4, hair: 5 };
const DIRS: [number, number][] = [[0, 1], [-1, 0], [1, 0], [0, -1]];

// Token bucket per player: steady one step per STEP_MS, with a small burst so
// network jitter doesn't cause rejected (rubber-banded) steps.
const STEP_MS = 135;
const BURST = 3;

interface Bucket { tokens: number; last: number }

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const n = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  return n || 'Wanderer';
}

function idx(raw: unknown, max: number): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < max ? (raw as number) : 0;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = 24;
  static world: World;
  private buckets = new Map<string, Bucket>();

  onCreate(): void {
    this.setState(new WorldState());
    const w = WorldRoom.world;

    this.onMessage('move', (client, msg: { dir?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      const dir = idx(msg?.dir, 4);
      if (!p) return;
      const b = this.buckets.get(client.sessionId)!;
      const now = Date.now();
      b.tokens = Math.min(BURST, b.tokens + (now - b.last) / STEP_MS);
      b.last = now;
      const [dx, dy] = DIRS[dir];
      if (b.tokens < 1 || !w.passable(p.x + dx, p.y + dy)) {
        client.send('reject', { x: p.x, y: p.y, dir: p.dir });
        return;
      }
      b.tokens -= 1;
      p.dir = dir;
      p.x += dx;
      p.y += dy;
    });

    this.onMessage('face', (client, msg: { dir?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.dir = idx(msg?.dir, 4);
    });

    this.onMessage('reading', (client, msg: { id?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = typeof msg?.id === 'string' ? msg.id : '';
      p.reading = w.compoundIds.has(id) ? id : '';
    });
  }

  onJoin(client: Client, options: Record<string, unknown> = {}): void {
    const w = WorldRoom.world;
    const p = new Player();
    p.name = cleanName(options.name);
    p.cls = CLASSES.includes(options.cls as string) ? (options.cls as string) : 'wizard';
    p.tunic = idx(options.tunic, LIMITS.tunic);
    p.skin = idx(options.skin, LIMITS.skin);
    p.hair = idx(options.hair, LIMITS.hair);
    // least crowded of the nearest spawn tiles
    const crowd = (x: number, y: number) => [...this.state.players.values()].filter((o) => o.x === x && o.y === y).length;
    const choices = w.spawns.slice(0, 6);
    const [x, y] = choices.reduce((best, s) => (crowd(...s) < crowd(...best) ? s : best), choices[Math.floor(Math.random() * choices.length)]);
    p.x = x;
    p.y = y;
    this.state.players.set(client.sessionId, p);
    this.buckets.set(client.sessionId, { tokens: BURST, last: Date.now() });
    console.log(`[room ${this.roomId}] ${p.name} the ${p.cls} joined (${this.clients.length} online)`);
  }

  onLeave(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.buckets.delete(client.sessionId);
    console.log(`[room ${this.roomId}] ${p?.name ?? client.sessionId} left (${this.clients.length} online)`);
  }
}
