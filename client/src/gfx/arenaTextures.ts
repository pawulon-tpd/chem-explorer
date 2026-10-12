// Procedural art for the arena realm and the portal that leads to it.
import Phaser from 'phaser';
import { canvas, dot, ellipse, mulberry32, rect, shade, type Ctx } from './paint';

export const ATEX = {
  floor: (v: number) => `a_floor_${v}`,
  wall: 'a_wall',
  wallTop: 'a_wall_top',
  pillar: 'a_pillar',
  brazier: (f: number) => `a_brazier_${f}`,
  portal: (f: number) => `portal_${f}`,
  bolt: 'a_bolt',
  arrow: 'a_arrow',
  note: 'a_note',
};
export const FLOOR_VARIANTS = 4;
export const PORTAL_FRAMES = 4;

function floor(ctx: Ctx, rnd: () => number): void {
  const base = 0xb8a68a;
  rect(ctx, 0, 0, 16, 16, base);
  // flagstones: two staggered rows of slabs with mortar lines
  const mortar = 0x8a7a62;
  rect(ctx, 0, 7, 16, 1, mortar);
  rect(ctx, 0, 15, 16, 1, mortar);
  const o = Math.floor(rnd() * 8);
  rect(ctx, o, 0, 1, 7, mortar);
  rect(ctx, (o + 8) % 16, 8, 1, 7, mortar);
  for (let i = 0; i < 14; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), shade(base, rnd() < 0.5 ? 0.92 : 1.06));
  if (rnd() < 0.35) dot(ctx, 2 + Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 12), 0x6e604c);
}

function wall(ctx: Ctx): void {
  // seen from above with a visible south face
  const top = 0x6b6f7a, face = 0x4c4f58, mortar = 0x34363d;
  rect(ctx, 0, 0, 16, 16, face);
  for (let y = 0; y < 16; y += 4) {
    rect(ctx, 0, y, 16, 1, mortar);
    const off = (y / 4) % 2 ? 4 : 0;
    for (let x = off; x < 16; x += 8) rect(ctx, x, y, 1, 4, mortar);
  }
  rect(ctx, 0, 0, 16, 5, top);
  rect(ctx, 0, 0, 16, 1, 0x8a8e99);
  rect(ctx, 0, 5, 16, 1, 0x2a2c32);
}

function wallTop(ctx: Ctx): void {
  // wall with more wall to the south: only the top surface shows
  rect(ctx, 0, 0, 16, 16, 0x6b6f7a);
  rect(ctx, 0, 0, 16, 1, 0x8a8e99);
  const rnd = mulberry32(5);
  for (let i = 0; i < 8; i++) dot(ctx, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 0x5d616b);
}

function pillar(ctx: Ctx): void {
  ellipse(ctx, 8, 30.5, 6, 1.6, 0x000000, 0.3);
  rect(ctx, 3, 27, 10, 4, 0x8d929c);
  rect(ctx, 4, 8, 8, 20, 0xc3c7cf);
  rect(ctx, 4, 8, 2, 20, 0xe2e5ea);
  rect(ctx, 10, 8, 2, 20, 0x9a9fa8);
  for (let x = 6; x < 10; x += 2) rect(ctx, x, 9, 1, 18, 0xaab0b9);
  rect(ctx, 3, 5, 10, 4, 0x8d929c);
  rect(ctx, 2, 4, 12, 2, 0xb1b6bf);
}

function brazier(ctx: Ctx, f: number): void {
  ellipse(ctx, 8, 30.5, 5, 1.4, 0x000000, 0.3);
  rect(ctx, 7, 22, 2, 8, 0x3a2a1c);
  rect(ctx, 4, 29, 8, 2, 0x3a2a1c);
  rect(ctx, 3, 18, 10, 4, 0x5a4026);
  rect(ctx, 3, 18, 10, 1, 0x8a6a3a);
  const flick = f ? 1 : 0;
  ellipse(ctx, 8, 14 - flick, 4.5, 5.5, 0xe0522a);
  ellipse(ctx, 8, 15, 3, 3.6, 0xf6a531);
  ellipse(ctx, 8 + (f ? 1 : -1), 16, 1.6, 2, 0xfff1a8);
  dot(ctx, 5 + flick * 6, 8, 0xf6a531);
}

function portal(ctx: Ctx, f: number): void {
  // stone archway with a swirling blue gate
  ellipse(ctx, 8, 30.5, 7, 1.6, 0x000000, 0.3);
  rect(ctx, 1, 10, 3, 21, 0x7d828c);
  rect(ctx, 12, 10, 3, 21, 0x7d828c);
  rect(ctx, 1, 10, 1, 21, 0xa9aeb8);
  rect(ctx, 0, 5, 16, 5, 0x8d929c);
  rect(ctx, 0, 5, 16, 1, 0xb8bdc6);
  rect(ctx, 6, 3, 4, 3, 0x8d929c);
  dot(ctx, 7, 4, 0x6fe3ff);
  dot(ctx, 8, 4, 0x6fe3ff);
  rect(ctx, 4, 10, 8, 21, 0x2a4fa8);
  for (let i = 0; i < 6; i++) {
    const y = 11 + ((i * 4 + f * 2) % 19);
    const x = 5 + ((i * 3 + f) % 6);
    rect(ctx, x, y, 2, 1, 0x8fdcff);
  }
  ellipse(ctx, 8, 20, 2.5, 4, 0x6fb8ff, 0.7);
}

function bolt(ctx: Ctx): void {
  ellipse(ctx, 5, 5, 4.5, 4.5, 0xe0522a, 0.45);
  ellipse(ctx, 5, 5, 3, 3, 0xf6a531);
  ellipse(ctx, 5, 5, 1.5, 1.5, 0xfff1a8);
}

function arrow(ctx: Ctx): void {
  // points right; rotated at runtime
  rect(ctx, 1, 2, 9, 1, 0x8a5a2b);
  rect(ctx, 10, 1, 2, 3, 0xd8dde4);
  dot(ctx, 12, 2, 0xd8dde4);
  rect(ctx, 0, 1, 2, 1, 0xffffff);
  rect(ctx, 0, 3, 2, 1, 0xd94a4a);
}

function note(ctx: Ctx): void {
  ellipse(ctx, 3, 8, 2.4, 1.8, 0xf2d34a);
  rect(ctx, 5, 1, 1, 7, 0xf2d34a);
  rect(ctx, 5, 1, 3, 1, 0xf2d34a);
  rect(ctx, 7, 2, 1, 2, 0xf2d34a);
}

function add(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const [c, ctx] = canvas(w, h);
  paint(ctx);
  scene.textures.addCanvas(key, c);
}

/** Portal frames are also used in the overworld. */
export function generatePortalTextures(scene: Phaser.Scene): void {
  for (let f = 0; f < PORTAL_FRAMES; f++) add(scene, ATEX.portal(f), 16, 32, (ctx) => portal(ctx, f));
}

export function generateArenaTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < FLOOR_VARIANTS; v++) {
    const rnd = mulberry32(400 + v);
    add(scene, ATEX.floor(v), 16, 16, (ctx) => floor(ctx, rnd));
  }
  add(scene, ATEX.wall, 16, 16, wall);
  add(scene, ATEX.wallTop, 16, 16, wallTop);
  add(scene, ATEX.pillar, 16, 32, pillar);
  for (let f = 0; f < 2; f++) add(scene, ATEX.brazier(f), 16, 32, (ctx) => brazier(ctx, f));
  generatePortalTextures(scene);
  add(scene, ATEX.bolt, 10, 10, bolt);
  add(scene, ATEX.arrow, 13, 5, arrow);
  add(scene, ATEX.note, 9, 11, note);
}
