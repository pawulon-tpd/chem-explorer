import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import type { Choice, CrystalStatus } from '../../../shared/rules';
import type { ClassId, HeroLook } from '../gfx/characters';
import { Council, type CrystalView, type Insight } from './council';

export interface Profile extends HeroLook {
  name: string;
}

/** Plain copy of a server-side Player (see server/src/state.ts). */
export interface NetPlayer extends Profile {
  id: string;
  pid: string;
  x: number;
  y: number;
  dir: number;
  reading: string;
  xp: number;
  level: number;
  calls: number;
  correct: number;
}

export interface XpEvent {
  gain: number;
  reason: string;
  xp: number;
  level: number;
  leveledUp: boolean;
}

export interface NetEvents {
  add(p: NetPlayer, isSelf: boolean): void;
  change(p: NetPlayer, isSelf: boolean): void;
  remove(id: string): void;
  /** Server refused a predicted move; snap back to its position. */
  reject(x: number, y: number, dir: number): void;
  xp(e: XpEvent): void;
  reveal(id: string, pIC50: number, hit: boolean): void;
  approved(id: string): void;
  disconnected(): void;
}

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname || 'localhost'}:2567`;
}

const TOKEN_KEY = 'chem-explorer:token';

/** Private per-browser token; the server keys progress by a hash of it. */
function playerToken(): string {
  const fresh = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-tok`);
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t || !/^[\w-]{16,128}$/.test(t)) {
      t = fresh();
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return fresh(); // no storage: progress lasts this visit only
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function plainPlayer(id: string, p: any): NetPlayer {
  return {
    id, pid: p.pid, name: p.name, cls: p.cls as ClassId, tunic: p.tunic, skin: p.skin, hair: p.hair,
    x: p.x, y: p.y, dir: p.dir, reading: p.reading, xp: p.xp, level: p.level, calls: p.calls, correct: p.correct,
  };
}

function plainCrystal(c: any): CrystalView {
  const votes: CrystalView['votes'] = [];
  c.votes.forEach((v: any, pid: string) => votes.push({ pid, name: v.name, cls: v.cls, choice: v.choice as Choice }));
  return { status: c.status as CrystalStatus, startedAt: c.startedAt, readyAt: c.readyAt, pIC50: c.pIC50 >= 0 ? c.pIC50 : null, votes };
}

/** One connection to the shared world room. */
export class Session {
  readonly council = new Council();
  private pendingInsight = new Map<string, (i: Insight) => void>();

  private constructor(private room: Room) {}

  get selfId(): string {
    return this.room.sessionId;
  }

  /** Resolves to null when the server can't be reached (the game then runs solo). */
  static async connect(profile: Profile, events: NetEvents, timeoutMs = 4000): Promise<Session | null> {
    const client = new Client(serverUrl());
    let room: Room;
    try {
      room = await Promise.race([
        client.joinOrCreate('world', { ...profile, token: playerToken() }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
    } catch (e) {
      console.info('[net] playing solo:', (e as Error).message ?? e);
      return null;
    }
    const s = new Session(room);
    const council = s.council;
    const $ = getStateCallbacks(room);
    const state = room.state as any;

    $(state).players.onAdd((p: any, id: string) => {
      const self = id === room.sessionId;
      const sync = () => {
        const np = plainPlayer(id, p);
        if (self) {
          council.self = { pid: np.pid, cls: np.cls, xp: np.xp, level: np.level, calls: np.calls, correct: np.correct };
          council.emit(null);
        }
        return np;
      };
      events.add(sync(), self);
      $(p).onChange(() => events.change(sync(), self));
    });
    $(state).players.onRemove((_p: unknown, id: string) => events.remove(id));

    $(state).crystals.onAdd((c: any, id: string) => {
      const update = () => {
        council.crystals.set(id, plainCrystal(c));
        council.emit(id);
      };
      update();
      $(c).onChange(update);
      $(c).votes.onAdd((v: any) => {
        update();
        $(v).onChange(update);
      });
      $(c).votes.onRemove(update);
    });

    room.onMessage('reject', (m: { x: number; y: number; dir: number }) => events.reject(m.x, m.y, m.dir));
    room.onMessage('clock', (m: { now: number }) => (council.clockOffset = m.now - Date.now()));
    room.onMessage('xp', (m: XpEvent) => events.xp(m));
    room.onMessage('reveal', (m: { id: string; pIC50: number; hit: boolean }) => events.reveal(m.id, m.pIC50, m.hit));
    room.onMessage('council', (m: { id: string; event: string }) => m.event === 'approved' && events.approved(m.id));
    room.onMessage('insight', (m: Insight) => {
      s.pendingInsight.get(m.id)?.(m);
      s.pendingInsight.delete(m.id);
    });
    room.onLeave(() => events.disconnected());
    room.send('clock');
    return s;
  }

  move(dir: number): void {
    this.room.send('move', { dir });
  }

  face(dir: number): void {
    this.room.send('face', { dir });
  }

  reading(compoundId: string | null): void {
    this.room.send('reading', { id: compoundId ?? '' });
  }

  vote(compoundId: string, choice: Choice | null): void {
    this.room.send('vote', { id: compoundId, choice: choice ?? 'none' });
  }

  /** Skill-gated private info (Foresight, Early readout). */
  insight(compoundId: string): Promise<Insight> {
    return new Promise((resolve) => {
      this.pendingInsight.set(compoundId, resolve);
      this.room.send('insight', { id: compoundId });
      setTimeout(() => {
        if (this.pendingInsight.get(compoundId) === resolve) {
          this.pendingInsight.delete(compoundId);
          resolve({ id: compoundId });
        }
      }, 3000);
    });
  }

  leave(): void {
    void this.room.leave();
  }
}
