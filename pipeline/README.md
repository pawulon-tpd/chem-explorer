# Pipeline

Turns an SDF into the tile world the client loads (`client/public/world.json`).

## Setup

```bash
uv venv pipeline/.venv --python 3.12
uv pip install --python pipeline/.venv -r pipeline/requirements.txt
```

## Run (from the repo root)

```bash
pipeline/.venv/bin/python scripts/make_sdf.py          # regenerate data/prototype.sdf
pipeline/.venv/bin/python pipeline/build_world.py      # build/refresh world.json
```

Options: `--sdf`, `--out`, `--method mds|umap`, `--grid 40x30`, `--seed 42`,
`--radius 4` (land around each compound), `--remap`.

**Coordinates are frozen.** Re-running keeps the tiles of compounds already in
`world.json` and only places new IDs (next to their most similar existing
compound). Pass `--remap` to re-embed everything; this breaks spatial memory, so
do it deliberately.

`mds` (classical/Torgerson MDS on Tanimoto distance) is the default and is
stable at small N. `umap` is for real datasets of thousands of compounds; the
first import takes a minute while numba compiles.

## Output metrics

- `spearman`: rank correlation between Tanimoto distance and tile distance
  over all pairs. Higher means walking distance tracks chemical distance.
- `knn3`: share of each compound's 3 most similar compounds that are also
  among its 3 nearest on the map.
- `mean_disp` / `max_disp`: how far (in tiles) snapping to the grid moved
  compounds from their embedded position.
