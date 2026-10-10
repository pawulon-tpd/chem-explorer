// Tiny canvas painting helpers shared by all procedural pixel art.

export type Ctx = CanvasRenderingContext2D;

export function css(c: number, a = 1): string {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/** Multiply brightness: f < 1 darkens, f > 1 lightens. */
export function shade(c: number, f: number): number {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (k((c >> 16) & 255) << 16) | (k((c >> 8) & 255) << 8) | k(c & 255);
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  ctx.fillStyle = css(c, a);
  ctx.fillRect(x, y, w, h);
}

export function dot(ctx: Ctx, x: number, y: number, c: number, a = 1): void {
  rect(ctx, x, y, 1, 1, c, a);
}

/** Pixel-exact filled ellipse (no anti-aliasing). */
export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: number, a = 1): void {
  ctx.fillStyle = css(c, a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** Draws rows of a pixel map: each char looks up a colour ('.' / ' ' = transparent). */
export function sprite(ctx: Ctx, x0: number, y0: number, rows: string[], pal: Record<string, number>): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c !== undefined) dot(ctx, x0 + x, y0 + y, c);
    }
  });
}

export function mirrored(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Deterministic PRNG so generated art is identical on every load and for every player. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
