// Generates public/world.mock.json — a deterministic stand-in for the pipeline's
// world.json (40x30, 3 regions, 15 compounds). Similarities are hand-picked
// plausible values, NOT computed Tanimoto. Run: node scripts/make-mock.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 40, H = 30, R = 4;
const series = {
  A: { region: 0, centre: [10, 9], name: 'Anilinoquinazolines', scaffold: 'c1ccc(Nc2ncnc3ccccc23)cc1', terrain: 'grass' },
  B: { region: 1, centre: [29, 8], name: 'Benzenesulfonamides', scaffold: 'c1ccccc1', terrain: 'sand' },
  C: { region: 2, centre: [20, 22], name: 'N-Arylpiperazines', scaffold: 'c1ccc(N2CCNCC2)cc1', terrain: 'snow' },
};
const cmp = [
  ['A1', 'A', 'H', 'COc1cc2ncnc(Nc3ccccc3)c2cc1OC', [0, 0], { MW: 281.31, cLogP: 3.37, TPSA: 56.27, HBD: 1, HBA: 5 }],
  ['A2', 'A', '3-Cl', 'COc1cc2ncnc(Nc3cccc(Cl)c3)c2cc1OC', [2, -1], { MW: 315.76, cLogP: 4.02, TPSA: 56.27, HBD: 1, HBA: 5 }],
  ['A3', 'A', '3-Cl,4-F', 'COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OC', [3, 1], { MW: 333.75, cLogP: 4.16, TPSA: 56.27, HBD: 1, HBA: 5 }],
  ['A4', 'A', '3-Br', 'COc1cc2ncnc(Nc3cccc(Br)c3)c2cc1OC', [1, 2], { MW: 360.21, cLogP: 4.13, TPSA: 56.27, HBD: 1, HBA: 5 }],
  ['A5', 'A', '3-ethynyl', 'COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OC', [-2, 1], { MW: 305.34, cLogP: 3.21, TPSA: 56.27, HBD: 1, HBA: 5 }],
  ['B1', 'B', 'H', 'NS(=O)(=O)c1ccccc1', [0, 0], { MW: 157.19, cLogP: 0.27, TPSA: 60.16, HBD: 1, HBA: 2 }],
  ['B2', 'B', '4-Me', 'Cc1ccc(S(N)(=O)=O)cc1', [2, 1], { MW: 171.22, cLogP: 0.58, TPSA: 60.16, HBD: 1, HBA: 2 }],
  ['B3', 'B', '4-Cl', 'NS(=O)(=O)c1ccc(Cl)cc1', [-1, 2], { MW: 191.64, cLogP: 0.92, TPSA: 60.16, HBD: 1, HBA: 2 }],
  ['B4', 'B', '4-OMe', 'COc1ccc(S(N)(=O)=O)cc1', [1, -2], { MW: 187.22, cLogP: 0.27, TPSA: 69.39, HBD: 1, HBA: 3 }],
  ['B5', 'B', '4-NH2', 'Nc1ccc(S(N)(=O)=O)cc1', [-2, -1], { MW: 172.21, cLogP: -0.15, TPSA: 86.18, HBD: 2, HBA: 3 }],
  ['C1', 'C', 'H', 'C1CN(CCN1)c1ccccc1', [0, 0], { MW: 162.24, cLogP: 0.83, TPSA: 15.27, HBD: 1, HBA: 2 }],
  ['C2', 'C', '2-OMe', 'COc1ccccc1N1CCNCC1', [-2, 1], { MW: 192.26, cLogP: 0.84, TPSA: 24.5, HBD: 1, HBA: 3 }],
  ['C3', 'C', '3-Cl', 'Clc1cccc(N2CCNCC2)c1', [2, -1], { MW: 196.68, cLogP: 1.48, TPSA: 15.27, HBD: 1, HBA: 2 }],
  ['C4', 'C', '3-CF3', 'FC(F)(F)c1cccc(N2CCNCC2)c1', [3, 1], { MW: 230.23, cLogP: 1.85, TPSA: 15.27, HBD: 1, HBA: 2 }],
  ['C5', 'C', '4-F', 'Fc1ccc(N2CCNCC2)cc1', [0, 2], { MW: 180.23, cLogP: 0.97, TPSA: 15.27, HBD: 1, HBA: 2 }],
];
const compounds = cmp.map(([id, s, change, smiles, [dx, dy], props]) => {
  const S = series[s];
  return {
    id, name: `${S.name.replace(/s$/, '')} (${change})`, series: s, smiles, molblock: '',
    scaffold_id: `scaf_${S.region}`,
    embedding_x: +((S.centre[0] + dx) / W).toFixed(4), embedding_y: +((S.centre[1] + dy) / H).toFixed(4),
    tile_x: S.centre[0] + dx, tile_y: S.centre[1] + dy, displacement: 0.0, properties: props,
  };
});
// Voronoi terrain with wilderness radius (Manhattan), plus a 1-tile land bridge A->C so it's walkable.
const tiles = [];
for (let y = 0; y < H; y++) {
  const row = [];
  for (let x = 0; x < W; x++) {
    let best = -1, bd = Infinity;
    for (const c of compounds) {
      const d = Math.abs(c.tile_x - x) + Math.abs(c.tile_y - y);
      if (d < bd) { bd = d; best = series[c.series].region; }
    }
    row.push(bd <= R ? best : -1);
  }
  tiles.push(row);
}
// Note: the A/B/C clusters are separated by water; mock leaves them that way except
// narrow causeways A -> C and A -> B so movement between regions can be tested.
for (let y = 12; y <= 20; y++) if (tiles[y][13] === -1) tiles[y][13] = 0;
for (let x = 13; x <= 18; x++) if (tiles[20][x] === -1) tiles[20][x] = 2;
for (let x = 17; x <= 24; x++) if (tiles[10][x] === -1) tiles[10][x] = 1; // A -> B causeway

// Plausible similarity values (higher within series).
const sim = {};
const within = { A: 0.72, B: 0.55, C: 0.6 };
for (const c of compounds) {
  const others = compounds.filter((o) => o.series === c.series && o.id !== c.id);
  sim[c.id] = others.slice(0, 3).map((o, i) => {
    const parent = o.id.endsWith('1') || c.id.endsWith('1');
    return [o.id, +(within[c.series] + (parent ? 0.08 : 0) - i * 0.04).toFixed(3)];
  }).sort((a, b) => b[1] - a[1]);
}
const world = {
  meta: { grid: [W, H], method: 'mock', seed: 42, wilderness_radius: R,
    metrics: { spearman: 0.81, knn3: 0.87, mean_disp: 0.0, max_disp: 0.0 } },
  regions: Object.values(series).map((s) => ({ id: `scaf_${s.region}`, index: s.region, name: s.name, scaffold_smiles: s.scaffold, terrain: s.terrain })),
  tiles, compounds, similarity: sim,
};
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'world.mock.json');
writeFileSync(out, JSON.stringify(world) + '\n');
console.log('wrote', out);
