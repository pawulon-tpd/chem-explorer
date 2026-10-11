import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StoredPlayer {
  name: string;
  cls: string;
  xp: number;
  calls: number;
  correct: number;
  supported?: number;
  refuted?: number;
}

export interface StoredCrystal {
  status: string;
  startedAt: number;
  readyAt: number;
  pIC50: number | null;
  votes: Record<string, { name: string; cls: string; choice: string }>;
}

export interface StoredHypothesis {
  statement: string;
  claim: string;
  crystals: string[];
  land: number;
  author: { pid: string; name: string; cls: string };
  createdAt: number;
  status: string;
  resolvedAt: number;
  revealed: number;
  stances: Record<string, { name: string; cls: string; stance: string }>;
  notes: { name: string; cls: string; text: string; at: number }[];
}

export interface Progress {
  version: 1;
  players: Record<string, StoredPlayer>;
  crystals: Record<string, StoredCrystal>;
  hypotheses?: Record<string, StoredHypothesis>;
  nextHypothesis?: number;
}

/** JSON-file persistence with debounced, atomic writes (tmp + rename). */
export class ProgressStore {
  data: Progress;
  private timer: NodeJS.Timeout | null = null;

  constructor(private path: string) {
    this.data = { version: 1, players: {}, crystals: {} };
    if (existsSync(path)) {
      try {
        const d = JSON.parse(readFileSync(path, 'utf8'));
        if (d?.version === 1) this.data = d;
      } catch (e) {
        console.warn(`[progress] could not read ${path}, starting fresh:`, (e as Error).message);
      }
    }
  }

  save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 500);
  }

  flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    renameSync(tmp, this.path);
  }
}
