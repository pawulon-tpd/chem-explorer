// Data contract for public/world.json (written by pipeline/build_world.py).

export type Terrain = 'grass' | 'sand' | 'snow';

export interface WorldMetrics {
  spearman: number;
  knn3: number;
  mean_disp?: number;
  max_disp: number;
}

export interface WorldMeta {
  grid: [number, number]; // [W, H]
  method: string;
  seed: number;
  wilderness_radius?: number;
  metrics: WorldMetrics;
}

export interface Region {
  id: string;
  index: number;
  name?: string;
  scaffold_smiles?: string;
  terrain: Terrain | string;
}

export interface CompoundProperties {
  MW?: number;
  cLogP?: number;
  TPSA?: number;
  HBD?: number;
  HBA?: number;
  [k: string]: number | undefined;
}

export interface Activity {
  target: string;
  /** null = not yet tested */
  pIC50: number | null;
  /** "measured", "illustrative" (demo values), or null when untested */
  source: string | null;
}

export interface Compound {
  id: string;
  name?: string;
  series?: string;
  smiles: string;
  molblock?: string;
  scaffold_id: string;
  embedding_x: number;
  embedding_y: number;
  tile_x: number;
  tile_y: number;
  displacement?: number;
  properties: CompoundProperties;
  activity?: Activity | null;
}

/** compound id -> list of [neighbour id, Tanimoto similarity], best first */
export type SimilarityMap = Record<string, [string, number][]>;

export interface Decor {
  x: number;
  y: number;
  kind: string;
  blocks: boolean;
}

export const OVERLAY_NONE = 0;
export const OVERLAY_PATH = 1;
export const OVERLAY_BRIDGE = 2;

export interface WorldData {
  meta: WorldMeta;
  regions: Region[];
  /** tiles[y][x] = region index, -1 = water (impassable) */
  tiles: number[][];
  /** overlay[y][x]: 0 none, 1 dirt road, 2 wooden bridge (over former water) */
  overlay?: number[][];
  decor?: Decor[];
  /** reachable free tiles near the first compound, nearest first */
  spawns?: [number, number][];
  compounds: Compound[];
  similarity: SimilarityMap;
}

export interface LoadedWorld {
  data: WorldData;
  source: 'world.json' | 'world.mock.json';
  isMock: boolean;
}

export const WATER = -1;
