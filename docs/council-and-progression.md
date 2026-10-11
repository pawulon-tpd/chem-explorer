# Synthesis council and progression

**Drafted:** 2026-10-11
**Builds on:** `game-concept.md` ("tie progression to hypotheses resolved, never
to activity counts").

## The loop

1. **Vote.** Any player standing in the realm can open an untested (grey)
   crystal and vote **⚒ Synthesise** or **✋ Skip**. Votes are public (name +
   class) and can be changed until the crystal is approved.
2. **Approve.** A crystal is approved when *synthesise − skip* reaches the
   quorum: a majority of players online (1 alone, 2 of 2 or 3, 3 for four or
   more).
3. **Lab capacity.** Each land (scaffold territory) has **2 synthesis slots**,
   plus 1 while a Bard with *Rally* is online. Approved crystals beyond that wait
   in a queue.
4. **Synthesis → assay → reveal.** Synthesis takes 40 s and the assay 20 s (demo
   timings; class skills shorten them). Then the result is revealed to everyone:
   the crystal lights up in its potency colour.
5. **Score the calls.** A result of pIC50 ≥ 7.0 counts as a *hit*.

| Your vote | Result | XP |
|---|---|---|
| Synthesise | hit | **+100** (called a hit) |
| Skip | not a hit | **+60** (called a miss; it was made anyway) |
| either | the other way | **+15** (learned from the result) |

Nothing else gives XP, apart from hypotheses (below). Each player's **calibration** (correct calls / resolved
calls) is shown on the character sheet. It's the honest measure of skill.

Hidden results for untested demo crystals live server-side in
`server/data/assay-results.json` (illustrative values, so clients can't peek). With
real data, the reveal step becomes "assay result imported" instead of a timer.

## Levels

| Level | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Total XP | 0 | 100 | 300 | 600 | 1000 | 1500 |

## Class skills (unlock at level 2 and 4)

Skills give **information or logistics, never extra vote weight**. A council
where some players' votes count more would reward rank, not judgement.

| Class (role) | Level 2 | Level 4 |
|---|---|---|
| Wizard (CADD) | **Foresight**: model prediction with error bars on untested crystals. The model is sometimes wrong. | **Sharper sight**: error bars halve |
| Warrior (synthesis) | **Swift forge**: crystals you back are synthesised 2× faster | **Master smith**: 3× faster |
| Ranger (medchem) | **Keen eye**: SAR estimate from tested neighbours (similarity-weighted) | **Cliff sense**: flags activity cliffs (similar, but ΔpIC50 ≥ 1.5) |
| Healer (purification) | **Purify**: assays run 2× faster while you're online | **Clean signal**: 3× faster |
| Paladin (assay) | **Early readout**: rough range (±0.6) while an assay runs | **Trial master**: range ±0.25 |
| Bard (project lead) | **Rally**: +1 synthesis slot per land while online | **Inspire**: everyone online gets +10% XP from resolved calls |

## Identity and persistence

- The browser makes a random player token (localStorage). The server stores
  progress under `pid = sha256(token)[:16]`, never broadcasting the token.
  This is not real authentication; it's enough for a prototype.
- Progress, votes and lab state persist in `server/data/progress.json`
  (gitignored). Delete it to reset the realm.

## Hypotheses as quests

A hypothesis is a **rationale** (free text, 8–140 characters, e.g. "a 3-halogen
fills the back pocket") plus a **testable claim** about 1–4 crystals in one
land:

| Claim | Holds when |
|---|---|
| *will all be hits* | every named crystal reaches pIC50 ≥ 7.0 |
| *will all miss* | no named crystal reaches 7.0 |
| *first beats second* | exactly two crystals; the first ends up more potent |

- **Must be testable:** at least one named crystal must be untested when proposed,
  otherwise the answer is already known. Each player can have at most 2 open
  hypotheses.
- **Quest markers:** untested crystals named by an open hypothesis show a gold
  **!** on the map. The quest log (Q) lists open and resolved hypotheses with
  their crystals' live status.
- **Stances:** other players can 👍 *believe* or 🤔 *doubt*. The author implicitly
  believes. Stances lock once the first named crystal's result arrives, so no
  switching sides after seeing evidence.
- **Evidence notes:** anyone can attach a short note (what a result says about the
  claim). Notes earn no XP, to protect the record's signal.
- **Resolution is automatic** once every named crystal is tested. Nobody rules
  on it, so no arguing.

| Who | Outcome | XP |
|---|---|---|
| author | supported | **+150** |
| author | refuted | **+50** (a clean refutation is still knowledge) |
| others | stance right | **+40** |
| others | stance wrong | **+10** |

The author can abandon a hypothesis until its first result arrives (no XP).

## Next

- Hypotheses that span lands, or claims about substituents ("every 3-halogen
  analogue…") rather than named crystals.
- Real accounts once this leaves prototype stage.
