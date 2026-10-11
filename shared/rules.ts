// Game rules shared by client and server (single source of truth).
// See docs/council-and-progression.md.

export type Choice = 'for' | 'against';
export type CrystalStatus = 'untested' | 'queued' | 'synthesising' | 'assaying' | 'tested';

/** Total XP needed to reach level index + 1. */
export const LEVELS = [0, 100, 300, 600, 1000, 1500];

export function levelFor(xp: number): number {
  let l = 1;
  while (l < LEVELS.length && xp >= LEVELS[l]) l++;
  return l;
}

/** XP progress inside the current level, 0..1 (1 at max level). */
export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelFor(xp);
  if (level >= LEVELS.length) return { level, into: 1, span: 1 };
  const lo = LEVELS[level - 1];
  return { level, into: xp - lo, span: LEVELS[level] - lo };
}

/** pIC50 at or above this counts as a hit. */
export const HIT = 7.0;

export const XP = { hitCalled: 100, missCalled: 60, learned: 15, inspireBonus: 0.1 };

export const SYNTH_MS = 40_000;
export const ASSAY_MS = 20_000;
export const SLOTS_PER_REGION = 2;

/** synthesise − skip votes needed: a majority of players online, capped at 3. */
export function quorum(online: number): number {
  return Math.max(1, Math.min(3, Math.floor(online / 2) + 1));
}

export type SkillId =
  | 'foresight' | 'sharp_sight'
  | 'swift_forge' | 'master_smith'
  | 'keen_eye' | 'cliff_sense'
  | 'purify' | 'clean_signal'
  | 'early_readout' | 'trial_master'
  | 'rally' | 'inspire';

export interface Skill {
  id: SkillId;
  cls: string;
  level: number;
  name: string;
  text: string;
}

export const SKILLS: Skill[] = [
  { id: 'foresight', cls: 'wizard', level: 2, name: 'Foresight', text: 'See a model prediction with error bars for untested crystals. The model is sometimes wrong.' },
  { id: 'sharp_sight', cls: 'wizard', level: 4, name: 'Sharper sight', text: 'Foresight error bars halve.' },
  { id: 'swift_forge', cls: 'warrior', level: 2, name: 'Swift forge', text: 'Crystals you vote to synthesise are made twice as fast.' },
  { id: 'master_smith', cls: 'warrior', level: 4, name: 'Master smith', text: 'Crystals you back are made three times as fast.' },
  { id: 'keen_eye', cls: 'ranger', level: 2, name: 'Keen eye', text: 'Estimate an untested crystal from its tested neighbours (similarity-weighted SAR).' },
  { id: 'cliff_sense', cls: 'ranger', level: 4, name: 'Cliff sense', text: 'Flags activity cliffs: similar neighbours whose potency differs by 1.5 log units or more.' },
  { id: 'purify', cls: 'healer', level: 2, name: 'Purify', text: 'Assays run twice as fast while you are in the realm.' },
  { id: 'clean_signal', cls: 'healer', level: 4, name: 'Clean signal', text: 'Assays run three times as fast while you are in the realm.' },
  { id: 'early_readout', cls: 'paladin', level: 2, name: 'Early readout', text: 'See a rough range (±0.6) while an assay is running.' },
  { id: 'trial_master', cls: 'paladin', level: 4, name: 'Trial master', text: 'Early readout range tightens to ±0.25.' },
  { id: 'rally', cls: 'bard', level: 2, name: 'Rally', text: 'Every land gets one extra synthesis slot while you are in the realm.' },
  { id: 'inspire', cls: 'bard', level: 4, name: 'Inspire', text: 'Everyone online earns 10% more XP from resolved calls.' },
];

export function skillsFor(cls: string, level: number): Set<SkillId> {
  return new Set(SKILLS.filter((s) => s.cls === cls && s.level <= level).map((s) => s.id));
}

export function hasSkill(cls: string, level: number, id: SkillId): boolean {
  return skillsFor(cls, level).has(id);
}

/** Similarity-weighted estimate from tested neighbours (Ranger's Keen eye). */
export function sarEstimate(neighbours: [number, number | null][]): number | null {
  let w = 0, s = 0;
  for (const [sim, p] of neighbours) {
    if (p === null) continue;
    w += sim;
    s += sim * p;
  }
  return w > 0 ? s / w : null;
}
