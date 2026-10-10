// Procedural medieval pixel art: terrain, shores, roads, bridges, decorations.
// Everything is painted onto canvases with a seeded PRNG, so every player sees
// identical art without any external asset files.
import Phaser from 'phaser';
import { heroFrame, lookKey, type HeroLook } from './characters';
import { canvas, dot, ellipse, mulberry32, rect, shade, type Ctx } from './paint';

export const TILE = 16;
export const TERRAIN_VARIANTS = 4;
export const WATER_FRAMES = 4;

/** Series -> crystal tint. Unknown series get a deterministic hash colour. */
const SERIES_COLOURS: Record<string, number> = { A: 0x5cf29b, B: 0xffc85a, C: 0x7cc4ff };
export function seriesColour(series: string | undefined): number {
  if (!series) return 0xd07cff;
  if (SERIES_COLOURS[series] !== undefined) return SERIES_COLOURS[series];
  let h = 0;
  for (const ch of series) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Phaser.Display.Color.HSVToRGB((h % 360) / 360, 0.55, 0.95).color;
}

export const TERRAIN_BASE: Record<string, number> = {
  grass: 0x5fb548,
  sand: 0xe6cf8f,
  snow: 0xeaf1f8,
  water: 0x3c78d0,
};
export function terrainColour(terrain: string): number {
  return TERRAIN_BASE[terrain] ?? 0x9a8a6a;
}

export const TEX = {
  terrain: (t: string, v: number) => `t_${t}_${v}`,
  water: (f: number) => `t_water_${f}`,
  foam: (side: Side) => `foam_${side}`,
  cliff: 'cliff_s',
  path: (v: number) => `path_${v}`,
  pathEdge: (side: Side) => `path_edge_${side}`,
  bridge: (horizontal: boolean) => (horizontal ? 'bridge_h' : 'bridge_v'),
  decor: (kind: string) => `decor_${kind}`,
  pedestal: 'pedestal',
  crystal: 'crystal',
  scroll: 'scroll',
  hero: (look: HeroLook, dir: number, frame: number) => `hero_${lookKey(look)}_${dir}_${frame}`,
};
export type Side = 'n' | 's' | 'e' | 'w';

/** Decorations that sit on the ground (drawn under characters). */
export const GROUND_DECOR = new Set(['flowers', 'tuft', 'dry_bush', 'snow_tuft', 'lily']);

// ------------------------------------------------------------------ terrain

function grassTile(ctx: Ctx, rnd: () => number): void {
  const base = TERRAIN_BASE.grass;
  rect(ctx, 0, 0, TILE, TILE, base);
  for (let i = 0; i < 14; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), shade(base, rnd() < 0.5 ? 0.9 : 1.08));
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(rnd() * 13), y = 2 + Math.floor(rnd() * 12);
    const d = shade(base, 0.78);
    dot(ctx, x, y, d);
    dot(ctx, x + 2, y, d);
    dot(ctx, x + 1, y + 1, d);
  }
}

function sandTile(ctx: Ctx, rnd: () => number): void {
  const base = TERRAIN_BASE.sand;
  rect(ctx, 0, 0, TILE, TILE, base);
  for (let i = 0; i < 16; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), shade(base, rnd() < 0.5 ? 0.93 : 1.05));
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(rnd() * 10), y = 2 + Math.floor(rnd() * 12);
    rect(ctx, x, y, 4, 1, shade(base, 0.88));
    rect(ctx, x + 4, y - 1, 2, 1, shade(base, 0.88));
  }
}

function snowTile(ctx: Ctx, rnd: () => number): void {
  const base = TERRAIN_BASE.snow;
  rect(ctx, 0, 0, TILE, TILE, base);
  for (let i = 0; i < 10; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0xd2deeb);
  for (let i = 0; i < 4; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0xffffff);
  const x = Math.floor(rnd() * 11), y = 3 + Math.floor(rnd() * 10);
  rect(ctx, x, y, 4, 1, 0xd8e3ef);
}

function waterTile(ctx: Ctx, frame: number): void {
  const base = TERRAIN_BASE.water;
  rect(ctx, 0, 0, TILE, TILE, base);
  rect(ctx, 0, 0, 8, 8, shade(base, 0.93));
  rect(ctx, 8, 8, 8, 8, shade(base, 0.93));
  const off = frame * 4;
  const hi = 0x86b8f2;
  rect(ctx, (1 + off) % 16, 4, 4, 1, hi);
  rect(ctx, (3 + off) % 16, 3, 2, 1, hi);
  rect(ctx, (9 + off) % 16, 12, 4, 1, hi);
  rect(ctx, (11 + off) % 16, 11, 2, 1, hi);
}

function foam(ctx: Ctx, side: Side): void {
  const c = 0xd8ecff;
  const d = 0x2c5ea8;
  const band = (x: number, y: number, w: number, h: number) => {
    rect(ctx, x, y, w, h, d, 0.45);
  };
  if (side === 'n') { band(0, 0, 16, 3); for (let x = 0; x < 16; x += 3) dot(ctx, x, 3, c); rect(ctx, 0, 0, 16, 1, c, 0.8); }
  if (side === 's') { rect(ctx, 0, 15, 16, 1, c, 0.8); for (let x = 1; x < 16; x += 3) dot(ctx, x, 14, c); }
  if (side === 'w') { rect(ctx, 0, 0, 1, 16, c, 0.8); for (let y = 1; y < 16; y += 3) dot(ctx, 1, y, c); }
  if (side === 'e') { rect(ctx, 15, 0, 1, 16, c, 0.8); for (let y = 0; y < 16; y += 3) dot(ctx, 14, y, c); }
}

function cliff(ctx: Ctx): void {
  // little earth ledge where land drops into the water (south edge)
  rect(ctx, 0, 12, 16, 4, 0x8a6a42);
  rect(ctx, 0, 12, 16, 1, 0x5a4428);
  for (let x = 0; x < 16; x += 4) rect(ctx, x + 1, 13, 1, 3, 0x6e5233);
  rect(ctx, 0, 15, 16, 1, 0x4a3820);
}

function pathTile(ctx: Ctx, rnd: () => number): void {
  const base = 0xc9a066;
  rect(ctx, 0, 0, TILE, TILE, base);
  for (let i = 0; i < 18; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), shade(base, rnd() < 0.5 ? 0.9 : 1.07));
  for (let i = 0; i < 2; i++) {
    const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
    rect(ctx, x, y, 2, 1, 0x9c8a74);
    dot(ctx, x, y - 1, 0xc8bba8);
  }
}

function pathEdge(ctx: Ctx, side: Side): void {
  const c = 0x9d7a45;
  const rnd = mulberry32(side.charCodeAt(0));
  for (let i = 0; i < 16; i++) {
    const depth = rnd() < 0.4 ? 2 : 1;
    if (side === 'n') rect(ctx, i, 0, 1, depth, c);
    if (side === 's') rect(ctx, i, 16 - depth, 1, depth, c);
    if (side === 'w') rect(ctx, 0, i, depth, 1, c);
    if (side === 'e') rect(ctx, 16 - depth, i, depth, 1, c);
  }
}

function bridge(ctx: Ctx, horizontal: boolean): void {
  const plank = 0xb07b45, dark = 0x6b4423, rail = 0x5a3a1c;
  if (horizontal) {
    rect(ctx, 0, 2, 16, 12, plank);
    for (let x = 0; x < 16; x += 4) rect(ctx, x, 2, 1, 12, dark);
    rect(ctx, 0, 1, 16, 2, rail);
    rect(ctx, 0, 13, 16, 2, rail);
    rect(ctx, 0, 15, 16, 1, 0x000000, 0.25);
  } else {
    rect(ctx, 2, 0, 12, 16, plank);
    for (let y = 0; y < 16; y += 4) rect(ctx, 2, y, 12, 1, dark);
    rect(ctx, 1, 0, 2, 16, rail);
    rect(ctx, 13, 0, 2, 16, rail);
  }
}

// ------------------------------------------------------------------ decor

const LEAF_DARK = 0x1f4d24;
const LEAF = 0x3a8a3c;
const LEAF_HI = 0x62b850;
const BARK = 0x6b4423;

function shadow(ctx: Ctx, cx: number, cy: number, rx: number): void {
  ellipse(ctx, cx, cy, rx, 1.6, 0x000000, 0.28);
}

function tree(ctx: Ctx): void {
  // 16x32, trunk stands on the bottom tile
  shadow(ctx, 8, 30.5, 6.5);
  rect(ctx, 6, 22, 4, 9, BARK);
  rect(ctx, 6, 22, 1, 9, shade(BARK, 0.75));
  rect(ctx, 5, 30, 1, 1, BARK);
  rect(ctx, 10, 30, 1, 1, BARK);
  ellipse(ctx, 8, 14, 8, 9.5, LEAF_DARK);
  ellipse(ctx, 8, 13.5, 7, 8.5, LEAF);
  ellipse(ctx, 6, 10, 3.5, 3.5, LEAF_HI);
  ellipse(ctx, 11, 15, 2.5, 2, shade(LEAF, 0.85));
  const rnd = mulberry32(7);
  for (let i = 0; i < 9; i++) dot(ctx, 3 + Math.floor(rnd() * 10), 7 + Math.floor(rnd() * 12), LEAF_DARK);
  dot(ctx, 5, 8, 0xa4e07c);
}

function pine(ctx: Ctx): void {
  shadow(ctx, 8, 30.5, 5.5);
  rect(ctx, 7, 26, 2, 5, BARK);
  const layers: [number, number][] = [[3, 3], [8, 5], [13, 6], [18, 7]];
  for (const [top, half] of layers) {
    for (let r = 0; r < 8; r++) {
      const w = Math.max(1, Math.round((half * (r + 1)) / 8));
      rect(ctx, 8 - w, top + r, w * 2, 1, r === 7 ? 0x1d4a36 : 0x2f6b4a);
      if (r < 2) rect(ctx, 8 - w, top + r, w * 2, 1, 0xf4f8fc);
    }
    dot(ctx, 8 - half + 1, top + 6, 0xf4f8fc);
  }
  rect(ctx, 7, 0, 2, 3, 0xf4f8fc);
}

function palm(ctx: Ctx): void {
  shadow(ctx, 8, 30.5, 5);
  const trunk: [number, number][] = [];
  for (let y = 30; y >= 12; y--) trunk.push([Math.round(7 + (30 - y) * 0.15), y]);
  for (const [x, y] of trunk) {
    rect(ctx, x, y, 3, 1, y % 3 === 0 ? 0x7a5a32 : 0x9c7444);
  }
  const fx = 10, fy = 11;
  const frond = 0x3e9b3c;
  const fronds: [number, number][] = [[-7, 3], [-5, -3], [0, -6], [5, -4], [7, 3], [3, 5], [-3, 5]];
  for (const [dx, dy] of fronds) {
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(fx + (dx * i) / steps), y = Math.round(fy + (dy * i) / steps + (i * i) / 18);
      rect(ctx, x, y, 2, 1, i === steps ? shade(frond, 0.8) : frond);
    }
  }
  rect(ctx, 9, 12, 2, 2, 0x5a3a1c);
}

function cactus(ctx: Ctx): void {
  shadow(ctx, 8, 30.5, 4);
  const g = 0x4f9a4a, d = 0x2f6b30, hi = 0x77c26a;
  rect(ctx, 6, 14, 5, 17, d);
  rect(ctx, 7, 14, 3, 16, g);
  rect(ctx, 8, 15, 1, 14, hi);
  rect(ctx, 2, 18, 3, 7, d); rect(ctx, 3, 18, 1, 6, g); rect(ctx, 4, 23, 3, 2, d);
  rect(ctx, 12, 16, 3, 6, d); rect(ctx, 13, 16, 1, 5, g); rect(ctx, 10, 20, 3, 2, d);
  for (let y = 16; y < 29; y += 3) { dot(ctx, 6, y, 0xf2efc6); dot(ctx, 10, y + 1, 0xf2efc6); }
  dot(ctx, 8, 13, 0xf26a8d);
}

function bush(ctx: Ctx): void {
  shadow(ctx, 8, 30.5, 6.5);
  ellipse(ctx, 8, 25, 7, 5.5, LEAF_DARK);
  ellipse(ctx, 8, 24.5, 6, 4.6, 0x3f9a3f);
  ellipse(ctx, 6, 23, 2.5, 2, LEAF_HI);
  for (const [x, y] of [[5, 26], [10, 24], [11, 27]] as [number, number][]) dot(ctx, x, y, 0xe0435a);
}

function rock(ctx: Ctx, ice = false): void {
  const [base, out, hi] = ice ? [0x9fc6e0, 0x4f7896, 0xe8f6ff] : [0x8a8f99, 0x4a4e57, 0xb8bdc6];
  shadow(ctx, 8, 30.5, 6);
  ellipse(ctx, 8, 26, 6.5, 4.8, out);
  ellipse(ctx, 8, 25.6, 5.6, 4, base);
  ellipse(ctx, 6.5, 24, 2.5, 1.6, hi);
  rect(ctx, 9, 26, 3, 1, out);
}

function flowers(ctx: Ctx, rnd: () => number): void {
  const cols = [0xe8505b, 0xf6d04d, 0xffffff, 0xb07cf0];
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(rnd() * 11), y = 18 + Math.floor(rnd() * 11);
    const c = cols[Math.floor(rnd() * cols.length)];
    dot(ctx, x, y + 1, 0x2f7a2a);
    dot(ctx, x - 1, y, c); dot(ctx, x + 1, y, c); dot(ctx, x, y - 1, c); dot(ctx, x, y, 0xffe28a);
  }
}

function tuft(ctx: Ctx, col: number): void {
  for (const [x, y] of [[4, 26], [9, 22], [11, 28]] as [number, number][]) {
    dot(ctx, x, y, col); dot(ctx, x + 2, y, col); dot(ctx, x + 1, y - 1, col); dot(ctx, x + 1, y, col);
    dot(ctx, x - 1, y - 1, col); dot(ctx, x + 3, y - 1, col);
  }
}

function dryBush(ctx: Ctx): void {
  const c = 0x8a6a3a;
  for (const [x0, y0] of [[8, 28], [5, 27]] as [number, number][]) {
    for (let i = 0; i < 4; i++) { dot(ctx, x0 - i, y0 - i, c); dot(ctx, x0 + i, y0 - i, c); dot(ctx, x0, y0 - i, c); }
  }
}

function snowTuft(ctx: Ctx): void {
  ellipse(ctx, 6, 27, 3.5, 2, 0xc9d8ea);
  ellipse(ctx, 6, 26.5, 3, 1.6, 0xffffff);
  ellipse(ctx, 11, 23, 2.5, 1.5, 0xc9d8ea);
  ellipse(ctx, 11, 22.6, 2, 1.1, 0xffffff);
}

function lily(ctx: Ctx): void {
  ellipse(ctx, 7, 25, 4, 2.6, 0x2f7a3a);
  ellipse(ctx, 7, 24.6, 3.4, 2.1, 0x4fa456);
  rect(ctx, 7, 23, 3, 2, 0x3c78d0);
  dot(ctx, 6, 24, 0xf7a8c8); dot(ctx, 5, 24, 0xffffff);
}

function pedestal(ctx: Ctx): void {
  shadow(ctx, 8, 15, 6.5);
  rect(ctx, 3, 8, 10, 7, 0x5d636d);
  rect(ctx, 4, 8, 8, 6, 0x9aa0a8);
  rect(ctx, 3, 7, 10, 2, 0xc5cad1);
  rect(ctx, 4, 11, 8, 1, 0x7d838c);
  dot(ctx, 5, 12, 0x7d838c); dot(ctx, 10, 13, 0x7d838c);
}

function crystal(ctx: Ctx): void {
  // white, tinted per series at runtime
  const pts = (y: number, half: number, c: number) => rect(ctx, 8 - half, y, half * 2, 1, c);
  const rows = [1, 2, 3, 4, 5, 5, 5, 4, 3, 2, 1];
  rows.forEach((h, i) => pts(i + 1, h + 1, 0x2a2a2a));
  rows.forEach((h, i) => pts(i + 1, h, 0xdddddd));
  rows.forEach((h, i) => rect(ctx, 8 - h, i + 1, h, 1, 0xffffff));
  rect(ctx, 8, 6, 4, 1, 0xb8b8b8);
  rect(ctx, 8, 7, 3, 3, 0xb0b0b0);
  dot(ctx, 6, 3, 0xffffff);
}

function scroll(ctx: Ctx): void {
  rect(ctx, 1, 2, 8, 6, 0xf1dfb0);
  rect(ctx, 0, 1, 10, 2, 0xc89c58);
  rect(ctx, 0, 7, 10, 2, 0xc89c58);
  rect(ctx, 2, 4, 6, 1, 0x8a6a3a);
  rect(ctx, 2, 5, 4, 1, 0x8a6a3a);
}

// ------------------------------------------------------------------ registration

function add(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const [c, ctx] = canvas(w, h);
  paint(ctx);
  scene.textures.addCanvas(key, c);
}

export function generateTextures(scene: Phaser.Scene): void {
  let seed = 1234;
  const painters: Record<string, (ctx: Ctx, rnd: () => number) => void> = { grass: grassTile, sand: sandTile, snow: snowTile };
  for (const t of Object.keys(painters)) {
    for (let v = 0; v < TERRAIN_VARIANTS; v++) {
      const rnd = mulberry32(seed++);
      add(scene, TEX.terrain(t, v), TILE, TILE, (ctx) => painters[t](ctx, rnd));
    }
  }
  for (let f = 0; f < WATER_FRAMES; f++) add(scene, TEX.water(f), TILE, TILE, (ctx) => waterTile(ctx, f));
  for (const s of ['n', 's', 'e', 'w'] as Side[]) {
    add(scene, TEX.foam(s), TILE, TILE, (ctx) => foam(ctx, s));
    add(scene, TEX.pathEdge(s), TILE, TILE, (ctx) => pathEdge(ctx, s));
  }
  add(scene, TEX.cliff, TILE, TILE, cliff);
  for (let v = 0; v < TERRAIN_VARIANTS; v++) {
    const rnd = mulberry32(seed++);
    add(scene, TEX.path(v), TILE, TILE, (ctx) => pathTile(ctx, rnd));
  }
  add(scene, TEX.bridge(true), TILE, TILE, (ctx) => bridge(ctx, true));
  add(scene, TEX.bridge(false), TILE, TILE, (ctx) => bridge(ctx, false));

  // decorations are 16x32, anchored at the bottom-centre of their tile
  const decor: Record<string, (ctx: Ctx) => void> = {
    tree, pine, palm, cactus, bush,
    rock: (ctx) => rock(ctx),
    ice_rock: (ctx) => rock(ctx, true),
    flowers: (ctx) => flowers(ctx, mulberry32(99)),
    tuft: (ctx) => tuft(ctx, shade(TERRAIN_BASE.grass, 0.72)),
    dry_bush: dryBush,
    snow_tuft: snowTuft,
    lily,
  };
  for (const [kind, paint] of Object.entries(decor)) add(scene, TEX.decor(kind), TILE, TILE * 2, paint);

  add(scene, TEX.pedestal, TILE, TILE, pedestal);
  add(scene, TEX.crystal, TILE, 13, crystal);
  add(scene, TEX.scroll, 10, 10, scroll);
}

/** Registers the 12 frames (4 dirs x 3) for one hero look, once. */
export function ensureHeroTextures(scene: Phaser.Scene, look: HeroLook): void {
  for (let d = 0; d < 4; d++) {
    for (let f = 0; f < 3; f++) {
      const key = TEX.hero(look, d, f);
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, heroFrame(look, d, f));
    }
  }
}
