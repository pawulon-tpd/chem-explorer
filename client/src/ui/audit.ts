import Phaser from 'phaser';
import { TILE } from '../gfx/textures';
import type { WorldData } from '../world/types';

const LOW = Phaser.Display.Color.ValueToColor(0xe05a47);
const MID = Phaser.Display.Color.ValueToColor(0xf2c14e);
const HIGH = Phaser.Display.Color.ValueToColor(0x57c26e);

/** Tanimoto similarity (0..1) -> red / yellow / green ramp. */
export function simColour(sim: number): number {
  const t = Phaser.Math.Clamp(sim, 0, 1);
  const [a, b, k] = t < 0.5 ? [LOW, MID, t / 0.5] : [MID, HIGH, (t - 0.5) / 0.5];
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(k * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

export function simColourCss(sim: number): string {
  return `#${simColour(sim).toString(16).padStart(6, '0')}`;
}

/** Lines from each compound to its top-3 Tanimoto neighbours, in world space. */
export function buildAuditLayer(scene: Phaser.Scene, world: WorldData): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(5).setVisible(false);
  const byId = new Map(world.compounds.map((c) => [c.id, c]));
  const centre = (x: number) => x * TILE + TILE / 2;
  const drawn = new Set<string>();
  for (const c of world.compounds) {
    for (const [nid, sim] of world.similarity[c.id] ?? []) {
      const n = byId.get(nid);
      const key = [c.id, nid].sort().join('|');
      if (!n || drawn.has(key)) continue;
      drawn.add(key);
      g.lineStyle(3, 0x000000, 0.35);
      g.lineBetween(centre(c.tile_x), centre(c.tile_y), centre(n.tile_x), centre(n.tile_y));
      g.lineStyle(1.5, simColour(sim), 0.95);
      g.lineBetween(centre(c.tile_x), centre(c.tile_y), centre(n.tile_x), centre(n.tile_y));
    }
  }
  return g;
}

export function renderMetrics(world: WorldData): void {
  const m = world.meta.metrics;
  const rows: [string, string][] = [
    [m.spearman.toFixed(2), 'Spearman ρ: rank agreement between chemical distance and walking distance (1 = perfect)'],
    [m.knn3.toFixed(2), 'kNN-3: share of each compound’s 3 most similar compounds that are also its 3 nearest on the map'],
    [`${(m.mean_disp ?? 0).toFixed(1)} / ${m.max_disp.toFixed(1)}`, 'mean / max tiles a compound moved when snapped to the grid'],
  ];
  const dl = document.getElementById('metrics')!;
  dl.replaceChildren(
    ...rows.flatMap(([v, label]) => {
      const dt = document.createElement('dt');
      dt.textContent = v;
      const dd = document.createElement('dd');
      dd.textContent = label;
      return [dt, dd];
    }),
  );
  const extra = document.createElement('dd');
  extra.style.gridColumn = '1 / -1';
  extra.textContent = `embedding: ${world.meta.method}, seed ${world.meta.seed}, ${world.compounds.length} compounds`;
  dl.append(extra);
}
