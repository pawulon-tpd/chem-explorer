import { WATER, type WorldData } from './types';

export const tileKey = (x: number, y: number) => `${x},${y}`;

/** Tiles you can't walk onto besides water: compound pedestals and blocking decor.
 *  server/src/world.ts mirrors this rule; keep them in sync. */
export function buildBlocked(d: WorldData): Set<string> {
  const blocked = new Set<string>();
  for (const c of d.compounds) blocked.add(tileKey(c.tile_x, c.tile_y));
  for (const o of d.decor ?? []) if (o.blocks) blocked.add(tileKey(o.x, o.y));
  return blocked;
}

export function isPassable(d: WorldData, blocked: Set<string>, x: number, y: number): boolean {
  const [W, H] = d.meta.grid;
  return x >= 0 && y >= 0 && x < W && y < H && d.tiles[y][x] !== WATER && !blocked.has(tileKey(x, y));
}
