import type { Choice, CrystalStatus } from '../../../shared/rules';

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
}

export interface Insight {
  id: string;
  foresight?: { mean: number; sd: number };
  readout?: { lo: number; hi: number };
}

/** Client-side mirror of the synthesis council (crystal states, own progress). */
export class Council {
  crystals = new Map<string, CrystalView>();
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

  tally(v: CrystalView): { yes: number; no: number } {
    let yes = 0, no = 0;
    for (const x of v.votes) x.choice === 'for' ? yes++ : no++;
    return { yes, no };
  }
}
