import { readFileSync } from 'node:fs';

interface WorldFile {
  meta: { grid: [number, number] };
  tiles: number[][];
  compounds: { id: string; tile_x: number; tile_y: number }[];
  decor?: { x: number; y: number; blocks: boolean }[];
  spawns?: [number, number][];
}

const WATER = -1;
const key = (x: number, y: number) => `${x},${y}`;

/** Server-side copy of the walkability rule in client/src/world/collision.ts. */
export class World {
  readonly W: number;
  readonly H: number;
  readonly spawns: [number, number][];
  readonly compoundIds: Set<string>;
  private tiles: number[][];
  private blocked = new Set<string>();

  constructor(path: string) {
    const d = JSON.parse(readFileSync(path, 'utf8')) as WorldFile;
    [this.W, this.H] = d.meta.grid;
    this.tiles = d.tiles;
    for (const c of d.compounds) this.blocked.add(key(c.tile_x, c.tile_y));
    for (const o of d.decor ?? []) if (o.blocks) this.blocked.add(key(o.x, o.y));
    this.compoundIds = new Set(d.compounds.map((c) => c.id));
    this.spawns = (d.spawns ?? []).filter(([x, y]) => this.passable(x, y));
    if (!this.spawns.length) {
      for (let y = 0; y < this.H && !this.spawns.length; y++)
        for (let x = 0; x < this.W; x++) if (this.passable(x, y)) { this.spawns.push([x, y]); break; }
    }
  }

  passable(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.W && y < this.H &&
      this.tiles[y][x] !== WATER && !this.blocked.has(key(x, y));
  }
}
