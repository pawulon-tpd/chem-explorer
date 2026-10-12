import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import type { ClassId } from '../gfx/characters';
import { serverUrl, type Profile } from './session';

export interface FighterView {
  id: string;
  name: string;
  cls: ClassId;
  tunic: number;
  skin: number;
  hair: number;
  level: number;
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  ko: boolean;
  kos: number;
  falls: number;
  specialReadyAt: number;
  shieldUntil: number;
  stunUntil: number;
  respawnAt: number;
}

export interface ShotView {
  id: string;
  kind: 'bolt' | 'arrow' | 'note';
  x: number;
  y: number;
  dir: number;
  owner: string;
}

export interface Fx {
  kind: 'hit' | 'slash' | 'nova' | 'charge' | 'heal' | 'shield' | 'discord' | 'fizzle' | 'join';
  x?: number;
  y?: number;
  dir?: number;
  dmg?: number;
  target?: string;
  owner?: string;
  name?: string;
}

export interface KoEvent {
  target: string;
  targetName: string;
  by: string;
  byName: string;
  cause: string;
}

export interface ArenaEvents {
  fighter(f: FighterView, self: boolean, added: boolean): void;
  fighterGone(id: string): void;
  shot(s: ShotView, added: boolean): void;
  shotGone(id: string): void;
  fx(m: Fx): void;
  ko(m: KoEvent): void;
  reject(x: number, y: number, dir: number): void;
  exit(): void;
  disconnected(): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const plainFighter = (id: string, f: any): FighterView => ({
  id, name: f.name, cls: f.cls, tunic: f.tunic, skin: f.skin, hair: f.hair, level: f.level, x: f.x, y: f.y, dir: f.dir,
  hp: f.hp, maxHp: f.maxHp, ko: f.ko, kos: f.kos, falls: f.falls, specialReadyAt: f.specialReadyAt,
  shieldUntil: f.shieldUntil, stunUntil: f.stunUntil, respawnAt: f.respawnAt,
});

const plainShot = (id: string, s: any): ShotView => ({ id, kind: s.kind, x: s.x, y: s.y, dir: s.dir, owner: s.owner });

/** Connection to the arena room (separate from the world room). */
export class ArenaSession {
  clockOffset = 0;
  private closing = false;

  private constructor(private room: Room) {}

  get selfId(): string {
    return this.room.sessionId;
  }

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  static async connect(profile: Profile & { level: number }, ev: ArenaEvents): Promise<ArenaSession | null> {
    let room: Room;
    try {
      room = await Promise.race([
        new Client(serverUrl()).joinOrCreate('arena', profile),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
      ]);
    } catch (e) {
      console.info('[arena] could not join:', (e as Error).message ?? e);
      return null;
    }
    const s = new ArenaSession(room);
    const $ = getStateCallbacks(room);
    const state = room.state as any;
    $(state).fighters.onAdd((f: any, id: string) => {
      const self = id === room.sessionId;
      ev.fighter(plainFighter(id, f), self, true);
      $(f).onChange(() => ev.fighter(plainFighter(id, f), self, false));
    });
    $(state).fighters.onRemove((_f: unknown, id: string) => ev.fighterGone(id));
    $(state).shots.onAdd((sh: any, id: string) => {
      ev.shot(plainShot(id, sh), true);
      $(sh).onChange(() => ev.shot(plainShot(id, sh), false));
    });
    $(state).shots.onRemove((_s: unknown, id: string) => ev.shotGone(id));
    room.onMessage('fx', (m: Fx) => ev.fx(m));
    room.onMessage('ko', (m: KoEvent) => ev.ko(m));
    room.onMessage('reject', (m: { x: number; y: number; dir: number }) => ev.reject(m.x, m.y, m.dir));
    room.onMessage('exit', () => ev.exit());
    room.onMessage('clock', (m: { now: number }) => (s.clockOffset = m.now - Date.now()));
    room.onLeave(() => {
      if (!s.closing) ev.disconnected();
    });
    room.send('clock');
    return s;
  }

  move(dir: number): void {
    this.room.send('move', { dir });
  }

  face(dir: number): void {
    this.room.send('face', { dir });
  }

  attack(dir: number): void {
    this.room.send('attack', { dir });
  }

  special(dir: number): void {
    this.room.send('special', { dir });
  }

  leave(): void {
    this.closing = true;
    void this.room.leave();
  }
}
