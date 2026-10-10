# Prototype plan — walkable chemical overworld

**Drafted:** 2026-10-10
**Based on:** `game-concept.md` (build order steps 1 + 2)
**Scope:** single player, static data, no backend server, no multiplayer.

---

## Goal

Get to a map you can walk around, built from a real embedding pipeline:

> SDF in → fingerprints → 2D embedding → tile grid → walkable Phaser world →
> walk up to a compound, open its card.

The dataset is deliberately tiny: **3 series × 5 analogues = 15 compounds**.
That's enough to check that the mechanics work: series cluster into regions,
analogues sit next to each other, regions are clearly separate, and the layout
is identical on every reload.

**What 15 compounds can't do:** answer the "does the geography lie?" question
from the concept doc. That still needs a few thousand real compounds. The
pipeline is built so that swapping the SDF is the only change needed; see
Phase 5.

---

## Phase 0 — Test dataset (`data/prototype.sdf`)

Three congeneric series. Within each series, every analogue differs from the
parent by one substitution, so the pairs are true MMPs. That makes it obvious
what a correct map looks like, and it sets up MMP routes later (concept step 5).

**Series A: 6,7-dimethoxy-4-anilinoquinazolines** (EGFR-like kinase scaffold)

| ID | Change   | SMILES |
|----|----------|--------|
| A1 | H        | `COc1cc2ncnc(Nc3ccccc3)c2cc1OC` |
| A2 | 3-Cl     | `COc1cc2ncnc(Nc3cccc(Cl)c3)c2cc1OC` |
| A3 | 3-Cl,4-F | `COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OC` |
| A4 | 3-Br     | `COc1cc2ncnc(Nc3cccc(Br)c3)c2cc1OC` |
| A5 | 3-ethynyl| `COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OC` |

**Series B: para-substituted benzenesulfonamides**

| ID | Change | SMILES |
|----|--------|--------|
| B1 | H      | `NS(=O)(=O)c1ccccc1` |
| B2 | 4-Me   | `Cc1ccc(S(N)(=O)=O)cc1` |
| B3 | 4-Cl   | `NS(=O)(=O)c1ccc(Cl)cc1` |
| B4 | 4-OMe  | `COc1ccc(S(N)(=O)=O)cc1` |
| B5 | 4-NH2  | `Nc1ccc(S(N)(=O)=O)cc1` |

**Series C: N-arylpiperazines**

| ID | Change  | SMILES |
|----|---------|--------|
| C1 | H       | `C1CN(CCN1)c1ccccc1` |
| C2 | 2-OMe   | `COc1ccccc1N1CCNCC1` |
| C3 | 3-Cl    | `Clc1cccc(N2CCNCC2)c1` |
| C4 | 3-CF3   | `FC(F)(F)c1cccc(N2CCNCC2)c1` |
| C5 | 4-F     | `Fc1ccc(N2CCNCC2)cc1` |

`scripts/make_sdf.py` turns this table into the SDF: RDKit 2D coordinates,
plus `ID`, `SERIES` and computed MW / cLogP / TPSA / HBD / HBA as SD tags. Later
runs read any SDF that has an `ID` tag; the other tags are optional.

---

## Phase 1 — Embedding → tilemap pipeline (`pipeline/build_world.py`)

Python with RDKit, umap-learn, scikit-learn and scipy. Steps:

1. **Read SDF**, sanitise, compute the Murcko scaffold → `scaffold_id`.
2. **Fingerprints:** Morgan radius 2, 2048 bits. Pairwise Tanimoto distance matrix.
3. **Embed to 2D** from the precomputed distance matrix. `--method` picks one:
   - `mds` (default for small N): metric MDS. Stable and honest at 15 points.
   - `umap`: `metric="precomputed"`, `n_neighbors=min(15, N-1)`, `random_state=42`.
     This is what we'll use at scale. At N=15 it's unreliable, so it's kept
     for comparison only.
4. **Quantise to a grid:** scale the embedding into a `W×H` grid (default
   40×30) with a margin. Assign tiles **one to one** with a linear assignment
   (`scipy.optimize.linear_sum_assignment` from each compound to candidate
   tiles). No two compounds can share a tile, and displacement stays minimal.
   Record each compound's displacement as a distortion metric.
5. **Terrain:** every tile gets the region of its nearest compound (Voronoi on
   the grid). Tiles further than distance `R` from any compound become
   "wilderness". Region → terrain type (A = grass, B = sand, C = snow,
   wilderness = water or dense forest). Region borders come straight from the data.
6. **Honesty metrics**, printed and saved to the output:
   - Spearman ρ between Tanimoto distance and tile Manhattan distance over all pairs
   - kNN preservation: the share of each compound's 3 nearest Tanimoto
     neighbours that are also among its 3 nearest on the map
   - mean and max quantisation displacement
7. **Freeze:** write `public/world.json`. If the file exists, keep the stored
   `tile_x/tile_y` for known IDs, place new IDs only, and print a warning. A
   full re-layout needs an explicit `--remap`. This implements the concept's
   "freeze, with explicit remapping events" decision now.

**`world.json` shape:**
```json
{
  "meta": { "grid": [40, 30], "method": "mds", "seed": 42,
            "metrics": { "spearman": 0.0, "knn3": 0.0, "max_disp": 0 } },
  "regions": [{ "id": "scaf_0", "smiles": "...", "terrain": "grass" }],
  "tiles": [[0, 0, 1, ...], ...],
  "compounds": [{ "id": "A1", "smiles": "...", "molblock": "...",
                  "scaffold_id": "scaf_0", "embedding_x": 0.0, "embedding_y": 0.0,
                  "tile_x": 12, "tile_y": 7, "properties": { "MW": 0.0 } }],
  "similarity": { "A1": [["A2", 0.82], ["A3", 0.71], ["A4", 0.69]] }
}
```

**Done when:** running it twice gives byte-identical output, the 15 compounds
form 3 visibly separate clusters, and kNN-3 preservation is ≥ 0.8 on this set.
That bar is easy because the series are so distinct. If we miss it, the
pipeline has a bug.

---

## Phase 2 — Walkable overworld (`client/`)

Vite + TypeScript + Phaser 3. Static, with no server: it loads `world.json` at boot.

- **Tilemap:** build a Phaser tilemap layer from `tiles[][]`. Use a small free
  16×16 tileset (Kenney "Tiny Town" or "Roguelike" pack, CC0) with one base
  tile per terrain, plus simple edge tiles if time allows.
- **Compounds as objects:** one sprite per compound on its tile, a crystal or
  sign marker tinted by series. Shown as a label once the player is close.
- **Player:** grid-locked movement (Pokémon style, one tile per step, tweened)
  with arrow keys or WASD. Wilderness tiles block movement or slow it. Camera
  follows the player, and the world is bounded to the grid.
- **Interaction:** facing a compound and pressing Space/Enter (or clicking it)
  opens the **compound card**, a DOM overlay rather than Phaser UI, because text
  and SVG are easier there:
  - structure depiction via **RDKit.js** (`get_svg()` from SMILES or molblock)
  - ID, series, scaffold, property table
  - "Nearest neighbours": the top 3 by Tanimoto, each showing its similarity
    and **its tile distance from here**. This is where a chemist sees whether
    the map's distances agree with the chemistry.
- **HUD:** current region name (scaffold) top left, and a minimap corner
  showing all compounds as dots.
- **Persistence check:** the layout comes from the file, so reloading must
  give the same world. No randomness in the client.

**Done when:** you can walk from the A region to the C region, open every one
of the 15 cards, and the map looks identical after a reload.

---

## Phase 3 — "Audit mode" overlay (the chemist-review tool)

The concept doc's real question is whether walking distance means chemical
distance. Build the means to check it, even on 15 compounds:

- Press `T` to toggle audit mode. Each compound draws lines to its 3 nearest
  Tanimoto neighbours, coloured by similarity. Long lines show where the map
  lies.
- A panel shows the Phase 1 metrics (Spearman ρ, kNN-3, max displacement).
- Optional heatmap tint: per-tile quantisation displacement.

This is the screen a chemist uses to review a real compound set later.

---

## Phase 4 — Stretch goals (only if Phases 0–3 are solid)

- Dotted MMP "paths" between analogues that differ by one substitution (from
  RDKit `rdMMPA`). Early preview of concept step 5.
- Cache `world.json` in the browser and show a "map changed since your last
  visit" banner after a `--remap`.

---

## Phase 5 — Scale to real data (the actual go/no-go)

No code changes: run `build_world.py --method umap --sdf real_set.sdf` on 2–5k
public compounds (e.g. a ChEMBL target set), then open audit mode with a chemist.

At this scale a 40×30 grid is too small, so this is where the zoom-level
question from the concept doc becomes real. Open question to settle then: a
fixed grid that grows with N (around 2–4× N tiles), or regions in the
overworld that you "enter" as sub-maps.

---

## Repository layout

```
chem_explorer/
  game-concept.md
  prototype-plan.md
  data/prototype.sdf
  scripts/make_sdf.py
  pipeline/build_world.py
  pipeline/requirements.txt      rdkit, umap-learn, scikit-learn, scipy, numpy
  client/                        Vite + TS + Phaser 3 + @rdkit/rdkit
    public/world.json            (pipeline output)
    public/tiles/                CC0 tileset
    src/main.ts, scenes/World.ts, ui/card.ts, ui/audit.ts
```

## Explicitly out of scope

Multiplayer and Colyseus, Postgres, hypotheses and evidence, fog of war, NPCs,
auth, editing remarks.

## Rough effort

| Phase | Estimate |
|-------|----------|
| 0 dataset | 0.5 day |
| 1 pipeline | 1–1.5 days |
| 2 overworld | 2–3 days |
| 3 audit mode | 1 day |
| **Total to a demo** | **about 5–6 days** |
