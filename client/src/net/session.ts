import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import type { ClassId, HeroLook } from '../gfx/characters';

export interface Profile extends HeroLook {
  name: string;
}

/** Plain copy of a server-side Player (see server/src/state.ts). */
export interface NetPlayer extends Profile {
  id: string;
  x: number;
  y: number;
  dir: number;
  reading: string;
}

export interface NetEvents {
  add(p: NetPlayer, isSelf: boolean): void;
  change(p: NetPlayer, isSelf: boolean): void;
  remove(id: string): void;
  /** Server refused a predicted move; snap back to its position. */
  reject(x: number, y: number, dir: number): void;
  disconnected(): void;
}

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname || 'localhost'}:2567`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(id: string, p: any): NetPlayer {
  return {
    id,
    name: p.name,
    cls: p.cls as ClassId,
    tunic: p.tunic,
    skin: p.skin,
    hair: p.hair,
    x: p.x,
    y: p.y,
    dir: p.dir,
    reading: p.reading,
  };
}

/** One connection to the shared world room. */
export class Session {
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
        client.joinOrCreate('world', profile),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
    } catch (e) {
      console.info('[net] playing solo:', (e as Error).message ?? e);
      return null;
    }
    const session = new Session(room);
    const $ = getStateCallbacks(room);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = room.state as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $(state).players.onAdd((p: any, id: string) => {
      const self = id === room.sessionId;
      events.add(plain(id, p), self);
      $(p).onChange(() => events.change(plain(id, p), self));
    });
    $(state).players.onRemove((_p: unknown, id: string) => events.remove(id));
    room.onMessage('reject', (m: { x: number; y: number; dir: number }) => events.reject(m.x, m.y, m.dir));
    room.onLeave(() => events.disconnected());
    return session;
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

  leave(): void {
    void this.room.leave();
  }
}
