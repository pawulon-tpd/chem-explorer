#!/usr/bin/env python3
"""Embed an SDF into a 2D tile world and write client/public/world.json.

SDF -> Morgan fingerprints -> Tanimoto distances -> 2D embedding -> one-to-one
tile assignment -> Voronoi terrain -> honesty metrics -> frozen world.json.
See prototype-plan.md, Phase 1.
"""
import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import rdFingerprintGenerator
from rdkit.Chem.Scaffolds import MurckoScaffold
from scipy.optimize import linear_sum_assignment
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parent.parent
TERRAINS = ["grass", "sand", "snow"]
WATER = -1
STRIDE = 2  # compounds sit on every 2nd tile so crystals are never adjacent
MARGIN = 3


# ---------------------------------------------------------------- chemistry

def read_sdf(path):
    recs = []
    for mol in Chem.SDMolSupplier(str(path)):
        if mol is None:
            print("WARNING: skipping unparseable SDF record", file=sys.stderr)
            continue
        if not mol.HasProp("ID"):
            raise SystemExit("ERROR: every SDF record needs an ID tag")
        recs.append(mol)
    if len(recs) < 4:
        raise SystemExit("ERROR: need at least 4 compounds")
    ids = [m.GetProp("ID") for m in recs]
    if len(set(ids)) != len(ids):
        raise SystemExit("ERROR: duplicate IDs in SDF")
    return recs


def props_of(mol):
    out = {}
    for key, cast in (("MW", float), ("cLogP", float), ("TPSA", float), ("HBD", int), ("HBA", int)):
        if mol.HasProp(key):
            out[key] = cast(float(mol.GetProp(key))) if cast is int else round(cast(mol.GetProp(key)), 4)
    return out


def activity_of(mol):
    """Assay result, or None if the compound has no target annotation at all."""
    if not mol.HasProp("TARGET"):
        return None
    measured = mol.HasProp("pIC50")
    return {
        "target": mol.GetProp("TARGET"),
        "pIC50": round(float(mol.GetProp("pIC50")), 2) if measured else None,
        "source": mol.GetProp("ACTIVITY_SOURCE") if mol.HasProp("ACTIVITY_SOURCE") else ("measured" if measured else None),
    }


def tanimoto_matrix(mols):
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    fps = [gen.GetFingerprint(m) for m in mols]
    n = len(fps)
    sim = np.zeros((n, n))
    for i in range(n):
        sim[i] = DataStructs.BulkTanimotoSimilarity(fps[i], fps)
    return sim


# ---------------------------------------------------------------- embedding

def classical_mds(dist, seed):
    """Torgerson MDS. Deterministic; sign of each axis fixed for stability."""
    n = dist.shape[0]
    j = np.eye(n) - np.ones((n, n)) / n
    b = -0.5 * j @ (dist ** 2) @ j
    vals, vecs = np.linalg.eigh(b)
    order = np.argsort(vals)[::-1][:2]
    vals, vecs = np.clip(vals[order], 0, None), vecs[:, order]
    for k in range(2):
        if vecs[np.argmax(np.abs(vecs[:, k])), k] < 0:
            vecs[:, k] *= -1
    return vecs * np.sqrt(vals)


def umap_embed(dist, seed):
    import umap  # slow first import (numba); only load when asked

    n = dist.shape[0]
    reducer = umap.UMAP(metric="precomputed", n_neighbors=min(15, n - 1), random_state=seed)
    return reducer.fit_transform(dist)


# ---------------------------------------------------------------- grid

def scale_to_grid(emb, w, h):
    """Uniform scale (keeps aspect ratio) into the grid interior, centred."""
    lo, hi = emb.min(axis=0), emb.max(axis=0)
    span = np.where(hi - lo > 0, hi - lo, 1.0)
    avail = np.array([w - 1 - 2 * MARGIN, h - 1 - 2 * MARGIN], dtype=float)
    s = float(np.min(avail / span))
    pos = (emb - lo) * s
    pos += (avail - (hi - lo) * s) / 2 + MARGIN
    return pos


def candidate_cells(w, h, taken=()):
    taken = set(taken)
    return [(x, y) for y in range(MARGIN, h - MARGIN, STRIDE)
            for x in range(MARGIN, w - MARGIN, STRIDE) if (x, y) not in taken]


def assign_tiles(pos, cells):
    cells_a = np.array(cells, dtype=float)
    cost = ((pos[:, None, :] - cells_a[None, :, :]) ** 2).sum(axis=2)
    rows, cols = linear_sum_assignment(cost)
    out = np.zeros((len(pos), 2), dtype=int)
    out[rows] = cells_a[cols].astype(int)
    return out


# ---------------------------------------------------------------- terrain

def build_terrain(tiles_xy, region_of, w, h, radius):
    grid = np.full((h, w), WATER, dtype=int)
    best = np.full((h, w), np.inf)
    ys, xs = np.mgrid[0:h, 0:w]
    for (tx, ty), r in zip(tiles_xy, region_of):
        cheb = np.maximum(np.abs(xs - tx), np.abs(ys - ty))
        eucl = np.hypot(xs - tx, ys - ty)
        mask = (cheb <= radius) & (eucl < best)
        grid[mask] = r
        best[mask] = eucl[mask]
    return grid


def components(grid):
    h, w = grid.shape
    comp = np.full((h, w), -1, dtype=int)
    n = 0
    for y in range(h):
        for x in range(w):
            if grid[y, x] == WATER or comp[y, x] >= 0:
                continue
            q = deque([(x, y)])
            comp[y, x] = n
            while q:
                cx, cy = q.popleft()
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and grid[ny, nx] != WATER and comp[ny, nx] < 0:
                        comp[ny, nx] = n
                        q.append((nx, ny))
            n += 1
    return comp, n


def carve_bridges(grid):
    """Join land components with 1-tile L-shaped bridges until all connected.

    Returns the set of (x, y) tiles that were water before carving (drawn as
    wooden bridges by the client).
    """
    bridged = set()
    while True:
        comp, n = components(grid)
        if n <= 1:
            return bridged
        a = np.argwhere(comp == 0)            # (y, x)
        b = np.argwhere(comp > 0)
        d = np.abs(a[:, None, :] - b[None, :, :]).sum(axis=2)
        i, j = np.unravel_index(np.argmin(d), d.shape)
        (y0, x0), (y1, x1) = a[i], b[j]
        fill = grid[y0, x0]
        sx = 1 if x1 >= x0 else -1
        for x in range(x0, x1 + sx, sx):
            if grid[y0, x] == WATER:
                grid[y0, x] = fill
                bridged.add((x, y0))
        sy = 1 if y1 >= y0 else -1
        for y in range(y0, y1 + sy, sy):
            if grid[y, x1] == WATER:
                grid[y, x1] = fill
                bridged.add((x1, y))


# ---------------------------------------------------------------- roads + decor

OVERLAY_NONE, OVERLAY_PATH, OVERLAY_BRIDGE = 0, 1, 2

# kind -> (probability per eligible tile, blocks movement)
DECOR = {
    "grass": [("tree", 0.10, True), ("bush", 0.03, True), ("rock", 0.015, True),
              ("flowers", 0.06, False), ("tuft", 0.08, False)],
    "sand": [("palm", 0.035, True), ("cactus", 0.03, True), ("rock", 0.03, True),
             ("dry_bush", 0.05, False)],
    "snow": [("pine", 0.10, True), ("ice_rock", 0.025, True), ("snow_tuft", 0.05, False)],
    "water": [("lily", 0.03, False)],
}
NEIGH4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def bfs_route(grid, blocked, start, goals):
    """Shortest 4-connected path over land from start to any goal tile."""
    h, w = grid.shape
    prev = {start: None}
    q = deque([start])
    while q:
        cur = q.popleft()
        if cur in goals:
            path = []
            while cur is not None:
                path.append(cur)
                cur = prev[cur]
            return path[::-1]
        cx, cy = cur
        for dx, dy in NEIGH4:
            nx, ny = cx + dx, cy + dy
            nxt = (nx, ny)
            if 0 <= nx < w and 0 <= ny < h and nxt not in prev and grid[ny, nx] != WATER \
                    and (nxt not in blocked or nxt in goals):
                prev[nxt] = cur
                q.append(nxt)
    return None


def build_roads(grid, tiles_xy, bridged):
    """Dirt roads joining every compound (and every bridge) into one network.

    Prim-style: grow a road network from the first compound, each time routing
    the nearest unconnected anchor onto it with BFS. Roads never cross compound
    tiles; they end on a tile next to the crystal.
    """
    h, w = grid.shape
    overlay = np.zeros((h, w), dtype=int)
    for x, y in bridged:
        overlay[y, x] = OVERLAY_BRIDGE
    compound_tiles = {tuple(map(int, t)) for t in tiles_xy}

    def approach(t):
        x, y = t
        return {(x + dx, y + dy) for dx, dy in NEIGH4
                if 0 <= x + dx < w and 0 <= y + dy < h and grid[y + dy, x + dx] != WATER
                and (x + dx, y + dy) not in compound_tiles}

    # (tiles, whole): compounds connect via any one approach tile; bridges join whole
    anchors = [(approach(t), False) for t in sorted(compound_tiles)]
    # each bridge contributes one anchor: its tiles
    bridge_comp = []
    seen = set()
    for b in sorted(bridged):
        if b in seen:
            continue
        group, q = set(), deque([b])
        seen.add(b)
        while q:
            cx, cy = q.popleft()
            group.add((cx, cy))
            for dx, dy in NEIGH4:
                nb = (cx + dx, cy + dy)
                if nb in bridged and nb not in seen:
                    seen.add(nb)
                    q.append(nb)
        bridge_comp.append(group)
    anchors += [(g, True) for g in bridge_comp]
    anchors = [a for a in anchors if a[0]]

    first, whole = anchors[0]
    network = set(first) if whole else {min(first)}
    pending = anchors[1:]
    while pending:
        best = None
        for idx, (a, _) in enumerate(pending):
            for start in sorted(a):
                path = bfs_route(grid, compound_tiles, start, network)
                if path and (best is None or len(path) < len(best[1])):
                    best = (idx, path)
        if best is None:
            raise SystemExit("ERROR: could not route roads between all compounds")
        idx, path = best
        tiles, whole = pending.pop(idx)
        network |= set(path) | (tiles if whole else set())
    for x, y in network:
        if overlay[y, x] == OVERLAY_NONE:
            overlay[y, x] = OVERLAY_PATH
    return overlay


def place_decor(grid, overlay, tiles_xy, regions, seed):
    h, w = grid.shape
    rng = np.random.default_rng(seed)
    keep_clear = set()
    for tx, ty in tiles_xy:
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                keep_clear.add((int(tx) + dx, int(ty) + dy))
    for y in range(h):
        for x in range(w):
            if overlay[y, x] != OVERLAY_NONE:
                for dx, dy in NEIGH4:
                    if overlay[y, x] == OVERLAY_BRIDGE:
                        keep_clear.add((x + dx, y + dy))
                keep_clear.add((x, y))
    decor = []
    for y in range(h):
        for x in range(w):
            roll = rng.random()  # always draw so placement is stable per tile
            if (x, y) in keep_clear:
                continue
            terrain = "water" if grid[y, x] == WATER else regions[grid[y, x]]["terrain"]
            acc = 0.0
            for kind, p, blocks in DECOR.get(terrain, []):
                acc += p
                if roll < acc:
                    decor.append({"x": x, "y": y, "kind": kind, "blocks": blocks})
                    break
    return decor


def reachable_spawns(grid, decor, tiles_xy, k=8):
    """Free tiles reachable from the first compound, nearest first."""
    h, w = grid.shape
    blocked = {(d["x"], d["y"]) for d in decor if d["blocks"]}
    blocked |= {tuple(map(int, t)) for t in tiles_xy}
    passable = lambda x, y: 0 <= x < w and 0 <= y < h and grid[y, x] != WATER and (x, y) not in blocked
    sx, sy = map(int, tiles_xy[0])
    starts = [(sx + dx, sy + dy) for dx, dy in NEIGH4 if passable(sx + dx, sy + dy)]
    dist = {s: 1 for s in starts}
    q = deque(starts)
    while q:
        cx, cy = q.popleft()
        for dx, dy in NEIGH4:
            nb = (cx + dx, cy + dy)
            if nb not in dist and passable(*nb):
                dist[nb] = dist[(cx, cy)] + 1
                q.append(nb)
    # every compound must have a reachable neighbour
    for tx, ty in tiles_xy:
        if not any((int(tx) + dx, int(ty) + dy) in dist for dx, dy in NEIGH4):
            raise SystemExit(f"ERROR: compound at ({tx},{ty}) unreachable after decoration")
    ring = sorted((d, y, x) for (x, y), d in dist.items() if d >= 2)
    return [[x, y] for _, y, x in ring[:k]]


# ---------------------------------------------------------------- metrics

def honesty_metrics(dist, tiles_xy, disp):
    n = len(tiles_xy)
    t = np.array(tiles_xy, dtype=float)
    manh = np.abs(t[:, None, :] - t[None, :, :]).sum(axis=2)
    eucl = np.hypot(*(t[:, None, :] - t[None, :, :]).transpose(2, 0, 1))
    iu = np.triu_indices(n, 1)
    rho = spearmanr(dist[iu], manh[iu]).statistic
    k = min(3, n - 1)
    hits = 0
    for i in range(n):
        chem = [j for j in np.lexsort((np.arange(n), dist[i])) if j != i][:k]
        geo = [j for j in np.lexsort((np.arange(n), eucl[i])) if j != i][:k]
        hits += len(set(chem) & set(geo))
    return {
        "spearman": round(float(rho), 4),
        "knn3": round(hits / (k * n), 4),
        "mean_disp": round(float(np.mean(disp)), 4),
        "max_disp": round(float(np.max(disp)), 4),
    }


# ---------------------------------------------------------------- main

def region_name(mols):
    series = {m.GetProp("SERIES") for m in mols if m.HasProp("SERIES")}
    names = [m.GetProp("NAME") for m in mols if m.HasProp("NAME")]
    if len(series) == 1 and names:
        family = names[0].split()[-1]
        return family[0].upper() + family[1:] + "s"
    return None


def ascii_map(grid, tiles_xy, ids, overlay, decor):
    sym = {WATER: "~"}
    chars = ".,:;"
    rows = [[sym.get(v, chars[v % len(chars)]) for v in row] for row in grid]
    for d in decor:
        if d["blocks"]:
            rows[d["y"]][d["x"]] = "T"
    for y, row in enumerate(overlay):
        for x, v in enumerate(row):
            if v:
                rows[y][x] = "=" if v == OVERLAY_BRIDGE else "#"
    for (x, y), cid in zip(tiles_xy, ids):
        rows[y][x] = cid[0]
    return "\n".join("".join(r) for r in rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sdf", default=str(ROOT / "data" / "prototype.sdf"))
    ap.add_argument("--out", default=str(ROOT / "client" / "public" / "world.json"))
    ap.add_argument("--method", choices=["mds", "umap"], default="mds")
    ap.add_argument("--grid", default="40x30", help="WxH")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--radius", type=int, default=5, help="land radius around each compound")
    ap.add_argument("--remap", action="store_true", help="discard frozen coordinates")
    args = ap.parse_args()

    w, h = (int(v) for v in args.grid.lower().split("x"))
    mols = read_sdf(args.sdf)
    ids = [m.GetProp("ID") for m in mols]
    n = len(mols)

    sim = tanimoto_matrix(mols)
    dist = 1.0 - sim
    emb = classical_mds(dist, args.seed) if args.method == "mds" else umap_embed(dist, args.seed)
    pos = scale_to_grid(emb, w, h)

    # Freeze: keep coordinates of compounds already in the world.
    out_path = Path(args.out)
    frozen = {}
    if out_path.exists() and not args.remap:
        old = json.loads(out_path.read_text())
        if old.get("meta", {}).get("grid") == [w, h]:
            frozen = {c["id"]: (c["tile_x"], c["tile_y"]) for c in old["compounds"]}
        else:
            print("WARNING: grid size changed; ignoring frozen coordinates", file=sys.stderr)

    known = [i for i, c in enumerate(ids) if c in frozen]
    new = [i for i, c in enumerate(ids) if c not in frozen]
    tiles_xy = np.zeros((n, 2), dtype=int)
    for i in known:
        tiles_xy[i] = frozen[ids[i]]
    if known and new:
        print(f"WARNING: {len(new)} new compound(s) placed beside their nearest frozen "
              f"neighbour; run with --remap for a full re-layout", file=sys.stderr)
        # Target = nearest known compound by Tanimoto, then nearest free cell.
        target = pos.copy()
        for i in new:
            nb = max(known, key=lambda j: (sim[i, j], -j))
            target[i] = tiles_xy[nb]
        cells = candidate_cells(w, h, taken=[tuple(tiles_xy[i]) for i in known])
        tiles_xy[new] = assign_tiles(target[new], cells)
    elif new:
        tiles_xy[new] = assign_tiles(pos[new], candidate_cells(w, h))
    if known and not new:
        print("Frozen layout reused for all compounds (use --remap to re-embed)")

    disp = np.hypot(*(pos - tiles_xy).T)

    # Regions = Murcko scaffolds, indexed in first-seen order.
    scaf_of = [Chem.MolToSmiles(MurckoScaffold.GetScaffoldForMol(m)) for m in mols]
    scaf_ids = list(dict.fromkeys(scaf_of))
    region_of = [scaf_ids.index(s) for s in scaf_of]
    regions = []
    for r, s in enumerate(scaf_ids):
        members = [m for m, ri in zip(mols, region_of) if ri == r]
        regions.append({
            "id": f"scaf_{r}",
            "index": r,
            "name": region_name(members) or s,
            "scaffold_smiles": s,
            "terrain": TERRAINS[r % len(TERRAINS)],
        })

    grid = build_terrain(tiles_xy, region_of, w, h, args.radius)
    bridged = carve_bridges(grid)
    _, ncomp = components(grid)
    for (x, y), cid in zip(tiles_xy, ids):
        if grid[y, x] == WATER:
            raise SystemExit(f"ERROR: compound {cid} sits on water")
    if ncomp != 1:
        raise SystemExit(f"ERROR: world not connected ({ncomp} components)")

    metrics = honesty_metrics(dist, tiles_xy.tolist(), disp)
    overlay = build_roads(grid, tiles_xy.tolist(), bridged)
    decor = place_decor(grid, overlay, tiles_xy.tolist(), regions, args.seed)
    spawns = reachable_spawns(grid, decor, tiles_xy.tolist())

    similarity = {}
    for i, cid in enumerate(ids):
        order = [j for j in np.lexsort((np.arange(n), -sim[i])) if j != i][:3]
        similarity[cid] = [[ids[j], round(float(sim[i, j]), 4)] for j in order]

    compounds = []
    for i, m in enumerate(mols):
        compounds.append({
            "id": ids[i],
            "name": m.GetProp("NAME") if m.HasProp("NAME") else ids[i],
            "series": m.GetProp("SERIES") if m.HasProp("SERIES") else "",
            "smiles": Chem.MolToSmiles(m),
            "molblock": Chem.MolToMolBlock(m),
            "scaffold_id": f"scaf_{region_of[i]}",
            "embedding_x": round(float(emb[i, 0]), 4),
            "embedding_y": round(float(emb[i, 1]), 4),
            "tile_x": int(tiles_xy[i, 0]),
            "tile_y": int(tiles_xy[i, 1]),
            "displacement": round(float(disp[i]), 4),
            "properties": props_of(m),
            "activity": activity_of(m),
        })

    world = {
        "meta": {"grid": [w, h], "method": args.method, "seed": args.seed,
                 "wilderness_radius": args.radius, "metrics": metrics},
        "regions": regions,
        "tiles": grid.tolist(),
        "overlay": overlay.tolist(),
        "decor": decor,
        "spawns": spawns,
        "compounds": compounds,
        "similarity": similarity,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(world, sort_keys=True, separators=(",", ":")) + "\n")

    print(ascii_map(grid, tiles_xy.tolist(), ids, overlay, decor))
    print(f"\n{n} compounds, {len(regions)} regions, {len(bridged)} bridge tile(s), "
          f"{len(decor)} decorations, method={args.method}")
    for r in regions:
        print(f"  region {r['index']} {r['terrain']:5s} {r['name']}  ({r['scaffold_smiles']})")
    print("metrics:", json.dumps(metrics))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
