// Procedural 16x24 pixel-art heroes. Each class maps an RPG archetype onto a
// drug-discovery role. dir: 0=down 1=left 2=right 3=up; frame: 0 idle, 1/2 walk.
import { canvas, ellipse, mirrored, rect, dot, shade, type Ctx } from './paint';

export type ClassId = 'wizard' | 'warrior' | 'ranger' | 'healer' | 'paladin' | 'bard';

export interface HeroClass {
  id: ClassId;
  title: string;
  role: string;
  blurb: string;
}

export const CLASSES: HeroClass[] = [
  { id: 'wizard', title: 'Wizard', role: 'CADD scientist', blurb: 'Reads the future in docking scores and free-energy runes. Sees further than anyone, and is wrong in interesting ways.' },
  { id: 'warrior', title: 'Warrior', role: 'Synthetic chemist', blurb: 'Forges molecules by hand. Seventeen steps, one column, no retreat.' },
  { id: 'ranger', title: 'Ranger', role: 'Medicinal chemist', blurb: 'Picks targets from afar and hits them with one precise substitution.' },
  { id: 'healer', title: 'Healer', role: 'Purification', blurb: 'Turns crude, cursed mixtures into something pure enough to test.' },
  { id: 'paladin', title: 'Paladin', role: 'Biologist / assay scientist', blurb: 'Puts every compound on trial. Only the potent survive the plate reader.' },
  { id: 'bard', title: 'Bard', role: 'Project leader', blurb: 'Keeps the party together and tells the story of the series at every meeting.' },
];
export const CLASS_IDS = CLASSES.map((c) => c.id);

export const TUNICS = [0x3b6fd1, 0xc0392b, 0x2e8b57, 0x8e44ad, 0xd68910, 0x17a2a2, 0x4a5a70, 0xd35486];
export const SKINS = [0xf6d1b0, 0xe0ac7e, 0xb57a4f, 0x7a4b2a];
export const HAIRS = [0x2b1d14, 0x6b3e1e, 0xd9b650, 0xb03a1a, 0xdedede];

export interface HeroLook {
  cls: ClassId;
  tunic: number; // index into TUNICS
  skin: number; // index into SKINS
  hair: number; // index into HAIRS
}

export const HERO_W = 16;
export const HERO_H = 24;

const OUTLINE = 0x1d1a24;
const BOOT = 0x3a2a1c;
const BELT = 0x6b4423;
const GOLD = 0xe0b23a;
const STEEL = 0xaeb7c2;
const STEEL_HI = 0xdfe5ec;
const STEEL_LO = 0x6f7884;
const WOOD = 0x7a5230;
const EYE = 0x1b1b2a;

interface Pal {
  tunic: number;
  skin: number;
  hair: number;
  pants: number;
}

const ROBED: ClassId[] = ['wizard', 'healer'];

// ------------------------------------------------------------------ body

function legs(ctx: Ctx, dir: number, frame: number, p: Pal): void {
  if (dir === 1) {
    const front = frame === 1 ? 4 : frame === 2 ? 8 : 6;
    const back = frame === 1 ? 9 : frame === 2 ? 5 : 8;
    rect(ctx, back, 18, 2, 4, shade(p.pants, 0.8));
    rect(ctx, back, 21, 2, 1, shade(BOOT, 0.8));
    rect(ctx, front, 18, 2, 4, p.pants);
    rect(ctx, front - 1, 21, 3, 1, BOOT);
    return;
  }
  const lh = frame === 1 ? 3 : 4;
  const rh = frame === 2 ? 3 : 4;
  rect(ctx, 5, 18, 2, lh, p.pants);
  rect(ctx, 5, 17 + lh, 2, 1, BOOT);
  rect(ctx, 9, 18, 2, rh, p.pants);
  rect(ctx, 9, 17 + rh, 2, 1, BOOT);
}

function robe(ctx: Ctx, dir: number, frame: number, col: number, trim: number): void {
  // feet peek out alternately
  if (dir === 1) {
    rect(ctx, frame === 1 ? 4 : frame === 2 ? 8 : 6, 21, 3, 1, BOOT);
    rect(ctx, 5, 11, 6, 10, OUTLINE);
    rect(ctx, 6, 11, 4, 9, col);
    rect(ctx, 4, 18, 8, 3, OUTLINE);
    rect(ctx, 5, 18, 6, 2, col);
    rect(ctx, 5, 19, 6, 1, trim);
    rect(ctx, 6, 11, 1, 7, shade(col, 0.85));
    return;
  }
  rect(ctx, frame === 2 ? 9 : 5, 21, 2, 1, BOOT);
  if (frame === 0) rect(ctx, 9, 21, 2, 1, BOOT);
  rect(ctx, 4, 11, 8, 9, OUTLINE);
  rect(ctx, 5, 11, 6, 8, col);
  rect(ctx, 3, 18, 10, 3, OUTLINE);
  rect(ctx, 4, 18, 8, 2, col);
  rect(ctx, 4, 19, 8, 1, trim);
  rect(ctx, 5, 11, 1, 7, shade(col, 0.85));
  if (dir === 0) rect(ctx, 7, 12, 2, 6, trim);
}

function torso(ctx: Ctx, dir: number, p: Pal): void {
  if (dir === 1) {
    rect(ctx, 5, 11, 6, 7, OUTLINE);
    rect(ctx, 6, 11, 4, 6, p.tunic);
    rect(ctx, 6, 11, 1, 6, shade(p.tunic, 0.85));
    rect(ctx, 6, 15, 4, 1, BELT);
    return;
  }
  rect(ctx, 4, 11, 8, 7, OUTLINE);
  rect(ctx, 5, 11, 6, 6, p.tunic);
  rect(ctx, 5, 11, 1, 6, shade(p.tunic, 0.85));
  rect(ctx, 10, 11, 1, 6, shade(p.tunic, 1.12));
  rect(ctx, 5, 15, 6, 1, BELT);
  if (dir === 0) dot(ctx, 8, 15, GOLD);
}

function arms(ctx: Ctx, dir: number, frame: number, sleeve: number, skin: number): void {
  if (dir === 1) {
    const x = 7 + (frame === 1 ? -1 : frame === 2 ? 1 : 0);
    rect(ctx, x, 12, 2, 4, OUTLINE);
    rect(ctx, x, 12, 2, 3, sleeve);
    rect(ctx, x, 15, 2, 1, skin);
    return;
  }
  const ly = 12 + (frame === 1 ? 1 : 0);
  const ry = 12 + (frame === 2 ? 1 : 0);
  rect(ctx, 3, ly, 1, 4, shade(sleeve, 0.85));
  dot(ctx, 3, ly + 4, skin);
  rect(ctx, 12, ry, 1, 4, shade(sleeve, 0.85));
  dot(ctx, 12, ry + 4, skin);
}

function head(ctx: Ctx, dir: number, p: Pal): void {
  if (dir === 3) {
    rect(ctx, 4, 2, 8, 8, p.hair);
    rect(ctx, 5, 2, 6, 1, shade(p.hair, 1.25));
    rect(ctx, 4, 8, 8, 2, shade(p.hair, 0.85));
    dot(ctx, 3, 6, p.skin);
    dot(ctx, 12, 6, p.skin);
    rect(ctx, 6, 10, 4, 1, shade(p.skin, 0.85));
    return;
  }
  if (dir === 1) {
    rect(ctx, 4, 5, 6, 5, p.skin);
    rect(ctx, 5, 10, 4, 1, shade(p.skin, 0.85));
    rect(ctx, 5, 2, 7, 3, p.hair);
    rect(ctx, 9, 5, 3, 4, p.hair);
    dot(ctx, 9, 7, p.skin); // ear
    rect(ctx, 5, 7, 1, 2, EYE);
    dot(ctx, 3, 8, shade(p.skin, 0.9)); // nose
    return;
  }
  rect(ctx, 5, 5, 6, 5, p.skin);
  rect(ctx, 6, 10, 4, 1, shade(p.skin, 0.85));
  rect(ctx, 4, 2, 8, 3, p.hair);
  rect(ctx, 5, 2, 6, 1, shade(p.hair, 1.25));
  rect(ctx, 4, 5, 1, 3, p.hair);
  rect(ctx, 11, 5, 1, 3, p.hair);
  rect(ctx, 6, 7, 1, 2, EYE);
  rect(ctx, 9, 7, 1, 2, EYE);
  dot(ctx, 3, 7, p.skin);
  dot(ctx, 12, 7, p.skin);
}

// ------------------------------------------------------------------ class gear

function staff(ctx: Ctx, x: number, top: number, wood: number): void {
  rect(ctx, x, top, 1, 22 - top, wood);
  dot(ctx, x, top, shade(wood, 1.3));
}

function wizardHat(ctx: Ctx, dir: number, col: number): void {
  const hat = shade(col, 0.7);
  if (dir === 1) {
    rect(ctx, 2, 4, 11, 1, shade(hat, 0.8));
    rect(ctx, 5, 3, 6, 1, GOLD);
    rect(ctx, 6, 2, 5, 1, hat);
    rect(ctx, 8, 1, 3, 1, hat);
    rect(ctx, 10, 0, 2, 1, hat);
    return;
  }
  rect(ctx, 2, 4, 12, 1, shade(hat, 0.8));
  rect(ctx, 4, 3, 8, 1, GOLD);
  rect(ctx, 5, 2, 6, 1, hat);
  rect(ctx, 6, 1, 4, 1, hat);
  rect(ctx, 8, 0, 3, 1, hat);
}

function orb(ctx: Ctx, cx: number, cy: number, col: number): void {
  ellipse(ctx, cx, cy, 2.6, 2.6, col, 0.25);
  ellipse(ctx, cx, cy, 1.6, 1.6, col);
  dot(ctx, Math.floor(cx) - 1, Math.floor(cy) - 1, 0xffffff);
}

function helmet(ctx: Ctx, dir: number): void {
  if (dir === 1) {
    rect(ctx, 4, 1, 8, 4, STEEL);
    rect(ctx, 5, 1, 6, 1, STEEL_HI);
    rect(ctx, 4, 5, 8, 1, STEEL_LO);
    rect(ctx, 4, 5, 1, 3, STEEL);
    return;
  }
  rect(ctx, 4, 1, 8, 4, STEEL);
  rect(ctx, 5, 1, 6, 1, STEEL_HI);
  rect(ctx, 4, 5, 8, 1, STEEL_LO);
  if (dir === 0) rect(ctx, 7, 5, 2, 2, STEEL);
  else rect(ctx, 4, 5, 8, 4, STEEL);
}

function shieldAt(ctx: Ctx, cx: number, cy: number, col: number): void {
  ellipse(ctx, cx, cy, 3, 3.6, STEEL_LO);
  ellipse(ctx, cx, cy, 2.2, 2.8, col);
  dot(ctx, Math.floor(cx), Math.floor(cy), GOLD);
}

function sword(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y, 1, 7, STEEL_HI);
  rect(ctx, x - 1, y + 7, 3, 1, GOLD);
  rect(ctx, x, y + 8, 1, 2, WOOD);
}

function hood(ctx: Ctx, dir: number, col: number): void {
  const h = shade(col, 0.85);
  if (dir === 1) {
    rect(ctx, 5, 2, 7, 3, h);
    rect(ctx, 9, 4, 3, 6, h);
    rect(ctx, 12, 3, 1, 4, shade(h, 0.85));
    return;
  }
  if (dir === 3) {
    rect(ctx, 4, 2, 8, 8, h);
    rect(ctx, 6, 10, 4, 1, shade(h, 0.8));
    rect(ctx, 5, 2, 6, 1, shade(h, 1.2));
    return;
  }
  rect(ctx, 4, 2, 8, 3, h);
  rect(ctx, 3, 4, 2, 6, h);
  rect(ctx, 11, 4, 2, 6, h);
  rect(ctx, 5, 2, 6, 1, shade(h, 1.2));
}

function bow(ctx: Ctx, x: number, facingLeft: boolean): void {
  const wood = 0x8a5a2b;
  const s = facingLeft ? 1 : -1; // string side
  rect(ctx, x, 9, 1, 10, wood);
  dot(ctx, x + s, 8, wood);
  dot(ctx, x + s, 19, wood);
  rect(ctx, x + 2 * s, 9, 1, 10, 0xe8e0c8);
}

function quiver(ctx: Ctx): void {
  rect(ctx, 10, 9, 3, 7, 0x7a4a24);
  rect(ctx, 10, 7, 1, 2, 0xffffff);
  rect(ctx, 12, 7, 1, 2, 0xd94a4a);
  rect(ctx, 11, 8, 1, 1, 0xf0d060);
}

function paladinArmour(ctx: Ctx, dir: number, tabard: number): void {
  if (dir === 1) {
    rect(ctx, 6, 11, 4, 6, STEEL);
    rect(ctx, 6, 11, 4, 1, STEEL_HI);
    rect(ctx, 7, 12, 2, 5, tabard);
    return;
  }
  rect(ctx, 5, 11, 6, 6, STEEL);
  rect(ctx, 5, 11, 6, 1, STEEL_HI);
  if (dir === 0) {
    rect(ctx, 6, 12, 4, 5, tabard);
    rect(ctx, 7, 13, 2, 1, GOLD);
    rect(ctx, 7, 13, 1, 3, GOLD);
  }
  rect(ctx, 5, 15, 6, 1, BELT);
}

function greatHelm(ctx: Ctx, dir: number, plume: number): void {
  rect(ctx, 4, 2, 8, 8, STEEL);
  rect(ctx, 5, 2, 6, 1, STEEL_HI);
  rect(ctx, 4, 9, 8, 1, STEEL_LO);
  if (dir === 0) {
    rect(ctx, 5, 6, 6, 1, OUTLINE);
    rect(ctx, 7, 7, 2, 2, OUTLINE);
  } else if (dir === 1) {
    rect(ctx, 4, 6, 4, 1, OUTLINE);
  }
  rect(ctx, 7, 0, 2, 2, plume);
}

function hammer(ctx: Ctx, x: number): void {
  rect(ctx, x, 10, 1, 9, WOOD);
  rect(ctx, x - 1, 7, 3, 3, STEEL);
  rect(ctx, x - 1, 7, 3, 1, STEEL_HI);
}

function bardCap(ctx: Ctx, dir: number, col: number): void {
  const feather = 0xf5e6a8;
  if (dir === 1) {
    rect(ctx, 5, 2, 7, 2, col);
    rect(ctx, 4, 4, 8, 1, shade(col, 0.75));
    rect(ctx, 10, 0, 1, 3, feather);
    dot(ctx, 11, 0, feather);
    return;
  }
  rect(ctx, 4, 2, 8, 2, col);
  rect(ctx, 3, 4, 10, 1, shade(col, 0.75));
  rect(ctx, 11, 0, 1, 3, feather);
  dot(ctx, 12, 0, feather);
}

function lute(ctx: Ctx, cx: number, cy: number, neck: [number, number][]): void {
  for (const [x, y] of neck) dot(ctx, x, y, 0x5a3a1c);
  ellipse(ctx, cx, cy, 2.6, 2.1, 0xb5733a);
  dot(ctx, Math.floor(cx), Math.floor(cy), 0x3a2410);
}

// ------------------------------------------------------------------ compose

function drawLeftOrFrontOrBack(ctx: Ctx, look: HeroLook, dir: number, frame: number): void {
  const tunic = TUNICS[look.tunic] ?? TUNICS[0];
  const p: Pal = { tunic, skin: SKINS[look.skin] ?? SKINS[0], hair: HAIRS[look.hair] ?? HAIRS[0], pants: 0x4a3a2e };
  const cls = look.cls;
  const back = dir === 3;

  ellipse(ctx, 8, 22.5, 5, 1.5, 0x000000, 0.28);

  // behind-the-body gear (seen from behind it is on the back)
  if (back) {
    if (cls === 'warrior') sword(ctx, 11, 6);
    if (cls === 'wizard') staff(ctx, 13, 6, WOOD);
    if (cls === 'healer') staff(ctx, 13, 7, 0xd9c9a3);
    if (cls === 'paladin') hammer(ctx, 13);
  }

  if (ROBED.includes(cls)) {
    const col = cls === 'healer' ? 0xf2efe6 : tunic;
    const trim = cls === 'healer' ? tunic : GOLD;
    robe(ctx, dir, frame, col, trim);
    arms(ctx, dir, frame, col, p.skin);
  } else {
    legs(ctx, dir, frame, p);
    torso(ctx, dir, p);
    if (cls === 'paladin') paladinArmour(ctx, dir, tunic);
    arms(ctx, dir, frame, cls === 'paladin' ? STEEL : tunic, p.skin);
  }

  head(ctx, dir, p);

  switch (cls) {
    case 'wizard':
      wizardHat(ctx, dir, tunic);
      if (dir === 0) { staff(ctx, 13, 6, WOOD); orb(ctx, 13.5, 4.5, 0x6ff3ff); }
      if (dir === 1) { staff(ctx, 2, 6, WOOD); orb(ctx, 2.5, 4.5, 0x6ff3ff); }
      if (back) orb(ctx, 13.5, 4.5, 0x6ff3ff);
      break;
    case 'healer':
      rect(ctx, dir === 1 ? 5 : 4, 4, dir === 1 ? 7 : 8, 1, GOLD);
      if (dir === 0 || dir === 1) staff(ctx, dir === 0 ? 13 : 2, 7, 0xd9c9a3);
      {
        const x = dir === 1 ? 2 : 13;
        dot(ctx, x, 3, 0x8fd8ff);
        rect(ctx, x - 1, 4, 3, 2, 0x5bbcf2);
        dot(ctx, x, 6, 0x5bbcf2);
        dot(ctx, x - 1, 4, 0xd6f2ff);
      }
      break;
    case 'warrior':
      helmet(ctx, dir);
      if (dir === 0) { sword(ctx, 13, 7); shieldAt(ctx, 3, 15, tunic); }
      if (dir === 1) shieldAt(ctx, 4, 14, tunic);
      if (back) shieldAt(ctx, 8, 14, tunic);
      break;
    case 'ranger':
      hood(ctx, dir, tunic);
      if (dir === 0) bow(ctx, 14, false);
      if (dir === 1) bow(ctx, 2, true);
      if (back) quiver(ctx);
      break;
    case 'paladin':
      greatHelm(ctx, dir, tunic);
      if (dir === 0) hammer(ctx, 13);
      if (dir === 1) hammer(ctx, 2);
      break;
    case 'bard':
      bardCap(ctx, dir, tunic);
      if (dir === 0) lute(ctx, 10, 15, [[8, 13], [7, 12], [6, 11]]);
      if (dir === 1) lute(ctx, 4, 15, [[6, 13], [7, 12], [8, 11]]);
      if (back) lute(ctx, 8, 14, [[8, 10], [8, 11]]);
      break;
  }
}

export function heroFrame(look: HeroLook, dir: number, frame: number): HTMLCanvasElement {
  const [c, ctx] = canvas(HERO_W, HERO_H);
  if (dir === 2) {
    drawLeftOrFrontOrBack(ctx, look, 1, frame);
    return mirrored(c);
  }
  drawLeftOrFrontOrBack(ctx, look, dir, frame);
  return c;
}

/** Stable texture-key fragment for a look (players sharing a look share textures). */
export function lookKey(look: HeroLook): string {
  return `${look.cls}-${look.tunic}-${look.skin}-${look.hair}`;
}

export function isValidLook(l: Partial<HeroLook> | null | undefined): l is HeroLook {
  return !!l && CLASS_IDS.includes(l.cls as ClassId) &&
    Number.isInteger(l.tunic) && l.tunic! >= 0 && l.tunic! < TUNICS.length &&
    Number.isInteger(l.skin) && l.skin! >= 0 && l.skin! < SKINS.length &&
    Number.isInteger(l.hair) && l.hair! >= 0 && l.hair! < HAIRS.length;
}
