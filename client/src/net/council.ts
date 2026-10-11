import type { Choice, Claim, CrystalStatus, HypStatus, Stance } from '../../../shared/rules';

export interface VoteView {
  pid: string;
  name: string;
  cls: string;
  choice: Choice;
}

export interface CrystalView {
  status: CrystalStatus;
  startedAt: number;
  readyAt: number;
  /** revealed pIC50, null while unknown */
  pIC50: number | null;
  votes: VoteView[];
}

export interface SelfStats {
  pid: string;
  cls: string;
  xp: number;
  level: number;
  calls: number;
  correct: number;
  supported: number;
  refuted: number;
}

export interface HypView {
  id: string;
  statement: string;
  claim: Claim;
  crystals: string[];
  land: number;
  author: { pid: string; name: string; cls: string };
  createdAt: number;
  status: HypStatus;
  resolvedAt: number;
  /** named crystals revealed since proposal; stances lock once > 0 */
  revealed: number;
  stances: { pid: string; name: string; cls: string; stance: Stance }[];
  notes: { name: string; cls: string; text: string; at: number }[];
}

export interface Insight {
  id: string;
  foresight?: { mean: number; sd: number };
  readout?: { lo: number; hi: number };
}

/** Client-side mirror of the synthesis council (crystal states, own progress). */
export class Council {
  crystals = new Map<string, CrystalView>();
  hypotheses = new Map<string, HypView>();
  self: SelfStats | null = null;
  /** server clock minus local clock, ms */
  clockOffset = 0;
  private listeners = new Set<(id: string | null) => void>();

  subscribe(fn: (id: string | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(id: string | null): void {
    for (const fn of this.listeners) fn(id);
  }

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  /** 0..1 through the current lab phase. */
  progress(v: CrystalView): number {
    if (v.readyAt <= v.startedAt) return 0;
    return Math.min(1, Math.max(0, (this.serverNow() - v.startedAt) / (v.readyAt - v.startedAt)));
  }

  /** Hypotheses naming this crystal, open first. */
  hypothesesFor(crystalId: string): HypView[] {
    return [...this.hypotheses.values()]
      .filter((h) => h.crystals.includes(crystalId) && h.status !== 'abandoned')
      .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.createdAt - a.createdAt);
  }

  /** Crystals named by at least one open hypothesis (quest markers). */
  questCrystals(): Set<string> {
    const out = new Set<string>();
    for (const h of this.hypotheses.values()) if (h.status === 'open') h.crystals.forEach((c) => out.add(c));
    return out;
  }

  tally(v: CrystalView): { yes: number; no: number } {
    let yes = 0, no = 0;
    for (const x of v.votes) x.choice === 'for' ? yes++ : no++;
    return { yes, no };
  }
}
