import type { LoadedWorld, WorldData } from './types';

// Relative URLs so the build works under any base path (GitHub Pages).
const PRIMARY = './world.json';
const FALLBACK = './world.mock.json';

async function tryFetch(url: string): Promise<WorldData | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    const text = await res.text();
    // Vite's dev server answers unknown paths with index.html (200) — guard against that.
    if (ct.includes('text/html') || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as WorldData;
  } catch {
    return null;
  }
}

function validate(d: WorldData): void {
  const [W, H] = d.meta?.grid ?? [];
  if (!W || !H) throw new Error('world: meta.grid missing');
  if (!Array.isArray(d.tiles) || d.tiles.length !== H || d.tiles.some((r) => r.length !== W)) {
    throw new Error(`world: tiles must be ${H} rows x ${W} cols (tiles[y][x])`);
  }
  for (const r of d.regions) if (typeof r.index !== 'number') throw new Error(`world: region ${r.id} missing index`);
  d.similarity ??= {};
  d.decor ??= [];
  d.overlay ??= d.tiles.map((r) => r.map(() => 0));
  d.spawns ??= [];
  for (const c of d.compounds) {
    if (c.tile_x < 0 || c.tile_x >= W || c.tile_y < 0 || c.tile_y >= H) {
      throw new Error(`world: compound ${c.id} tile out of bounds`);
    }
    c.properties ??= {};
  }
}

export async function loadWorld(): Promise<LoadedWorld> {
  const real = await tryFetch(PRIMARY);
  if (real) {
    validate(real);
    return { data: real, source: 'world.json', isMock: false };
  }
  console.warn('[world] world.json not found — falling back to world.mock.json');
  const mock = await tryFetch(FALLBACK);
  if (!mock) throw new Error('Could not load world.json or world.mock.json');
  validate(mock);
  return { data: mock, source: 'world.mock.json', isMock: true };
}
