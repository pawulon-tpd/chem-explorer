# Remarks Explorer as a 2D exploration game — concept

**Drafted:** 2026-10-10
**Status:** concept only, nothing built
**Relationship to current app:** this is a rebuild direction, not an increment on
the prototype in this repo. See `plan.md` for what exists today.

---

## The core bet

The Zelda/Pokémon framing is not decoration on a graph app. The bet is narrower
and more defensible than that:

> **Chemical space genuinely is a 2D map in how chemists already think, and
> nobody has built a good one.**

A tile world is a better fit for that mental model than the hub-and-spoke
network the current prototype draws. The decisive difference is *persistence of
place*: today's `cose` layout randomises on every reload, so nothing can ever be
remembered spatially. A map that is the same every time lets spatial memory do
real work.

If that claim holds, the game layer is justified. If it doesn't, this is a toy
that gets opened twice.

---

## Mechanics worth taking

### Overworld = embedded chemical space
UMAP the fingerprints, quantise to a tile grid. Regions emerge as scaffold
clusters. Two compounds near each other on screen *are* near each other
chemically — permanently, across sessions and across users.

### Routes between compounds = matched molecular pairs
The strongest mechanic available. An MMP is literally one transform (swap a
methyl for a chlorine). That is a *step*. A path through the world becomes an
SAR narrative, and walking it is what a chemist already does mentally when
reading a series.

### Fog of war = unexplored space
Regions nobody has synthesised or assayed stay dark, and light up as data
arrives. This answers *"where haven't we looked?"* — a real strategic question
that current tooling answers badly or not at all.

### Hypothesis = the quest
A hypothesis is already quest-shaped: a claim, a region it applies to, and
compounds that support or kill it. This is the most valuable idea here and it
is worth adopting **even if the game never gets built** — it upgrades remarks
from free-floating notes on nodes into evidence attached to a claim.

### Other users as avatars in the same world
Seeing a colleague standing in the region you were about to explore prevents
duplicated work. Cheap to build, high real-world value.

### Models as unreliable NPCs
A docking oracle; an ADMET fortune-teller whose prophecies are sometimes wrong.
Cute, but also pedagogically honest — it encodes model uncertainty into the
interaction instead of presenting a number with false precision.

---

## What to drop

**XP and leaderboards for annotation volume.** Gamified incentives on a
scientific record are a known failure mode: you get point-farming, and the
remarks corpus fills with noise. That corpus is the actual asset being built —
protecting its signal matters more than engagement metrics.

Tie progression to **hypotheses resolved**, never to activity counts.

---

## Data model sketch — hypothesis as quest

```
Hypothesis
  id
  statement         "basic amine at R2 improves permeability"
  author, created_at
  scope             region / scaffold / explicit compound set
  status            open | supported | refuted | abandoned
  resolved_at, resolution_note

Evidence
  id
  hypothesis_id     -> Hypothesis
  compound_id       -> Compound
  stance            supports | refutes | ambiguous
  note              (this is today's "annotation")
  author, created_at
  assay_ref         optional pointer to the measurement
```

The key shift from the current app: an annotation today answers *"what do I
think about this compound?"*. Evidence answers *"what does this compound say
about this claim?"* — which is the question project meetings actually turn on.

Compounds keep their own persistent identity and map coordinates:

```
Compound
  id, molblock, properties{}
  embedding_x, embedding_y      continuous, from UMAP
  tile_x, tile_y                quantised, stable once assigned
  scaffold_id                   Murcko framework -> region membership
```

---

## Stack for a rebuild

| Layer | Choice | Why |
|-------|--------|-----|
| 2D engine | **Phaser 3** | Mature tilemap + movement; right granularity for this |
| Multiplayer | **Colyseus** | Authoritative server-side rooms with real state reconciliation |
| Persistence | **Postgres + RDKit cartridge** | Chemistry-aware queries, substructure search |
| Chemistry backend | **RDKit (Python)** | Fingerprints, UMAP, MMP generation, scaffold decomposition |
| Structure drawing | **RDKit.js** | Client-side depiction only |

Note on multiplayer: the current broadcast-and-hope Socket.io model will not
survive avatars moving in real time. Colyseus is a deliberate upgrade, not a
lateral move.

---

## The hard problem — solve this first

UMAP distances are already not trustworthy as a metric, and snapping them to a
tile grid distorts them further.

If a player learns *"walking three tiles east means a small chemical change"*
and that relationship is inconsistent across the map, **the game actively
teaches something false.** That is worse than no tool.

**Therefore the first prototype is the embedding-to-tilemap step alone** — on a
few thousand real public compounds (e.g. a ChEMBL target set), not the 15-compound sample. Then have a
chemist walk the map and say whether the geography lies.

Everything else in this document is ordinary engineering. This one question
decides whether the thing is brilliant or misleading.

---

## What makes it stick

It has to be the fastest way to do a **boring daily task** — triaging a batch of
assay results, prepping for a project meeting. The game layer rides on top of
that utility; it cannot substitute for it.

If it isn't faster than the current tool for a boring task, it gets used twice.

---

## Build order

1. **Embedding → tilemap**, on real compound sets. Validate with a chemist.
   Kill the project here if the geography can't be made honest.
2. **Static explorable map** — walk around, click a compound, see its card.
   Single player. No sync.
3. **Hypothesis + evidence model** — the data upgrade that pays off regardless.
4. **Multiplayer presence** — avatars, shared world via Colyseus.
5. **MMP routes** between neighbouring compounds.
6. **Fog of war** driven by real assay coverage.
7. Oracles/NPCs last — flavour, not foundation.

---

## Open questions

- Scale: a real project is 10k–100k compounds, not 15. Needs zoom levels
  (world → region → series → compound). What's the tile budget per level?
- Does the map re-embed when new compounds arrive, or are coordinates frozen
  once assigned? Re-embedding breaks spatial memory; freezing degrades layout
  quality over time. Probably: freeze, with periodic explicit "remapping" events.
- Who authors hypotheses — anyone, or project leads? Affects whether the quest
  list stays meaningful.
- Is this one world per dataset, or one shared world across all datasets?
