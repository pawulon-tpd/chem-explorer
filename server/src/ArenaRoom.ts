import { Client, Room } from '@colyseus/core';
import {
  ARENA, ARENA_EXIT, ARENA_SPAWNS, arenaPassesShot, arenaWalkable, DIRS, fighterFor,
} from '../../shared/arena.js';
import { Gladiator, Projectile, ArenaState } from './arenaState.js';

const CLASSES = ['wizard', 'warrior', 'ranger', 'healer', 'paladin', 'bard'];
const STEP_MS = 135;
const BURST = 3;

interface Shot { range: number; dmg: number; stepMs: number; nextAt: number }
interface Private { tokens: number; last: number; attackReadyAt: number }

function idx(raw: unknown, max: number): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < max ? (raw as number) : 0;
}

function cleanName(raw: unknown): string {
  const n = (typeof raw === 'string' ? raw : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  return n || 'Gladiator';
}

/**
 * Free-for-all arena. Server-authoritative: movement, attacks, projectiles,
 * specials and knockouts are all simulated here. Fighting never awards XP.
 */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 16;
  private priv = new Map<string, Private>();
  private shotMeta = new Map<string, Shot>();
  private shotSeq = 0;

  onCreate(): void {
    this.setState(new ArenaState());
    this.onMessage('move', (c, m: { dir?: unknown }) => this.onMove(c, idx(m?.dir, 4)));
    this.onMessage('face', (c, m: { dir?: unknown }) => {
      const f = this.state.fighters.get(c.sessionId);
      if (f && !f.ko) f.dir = idx(m?.dir, 4);
    });
    this.onMessage('attack', (c, m: { dir?: unknown }) => this.onAttack(c, idx(m?.dir, 4)));
    this.onMessage('special', (c, m: { dir?: unknown }) => this.onSpecial(c, idx(m?.dir, 4)));
    this.onMessage('clock', (c) => c.send('clock', { now: Date.now() }));
    this.setSimulationInterval(() => this.tick(), ARENA.tickMs);
  }

  onJoin(client: Client, o: Record<string, unknown> = {}): void {
    const f = new Gladiator();
    f.name = cleanName(o.name);
    f.cls = CLASSES.includes(o.cls as string) ? (o.cls as string) : 'wizard';
    f.tunic = idx(o.tunic, 8);
    f.skin = idx(o.skin, 4);
    f.hair = idx(o.hair, 5);
    f.level = Math.max(1, Math.min(6, Number(o.level) || 1)); // cosmetic only
    f.maxHp = fighterFor(f.cls).hp;
    this.respawn(f);
    this.state.fighters.set(client.sessionId, f);
    this.priv.set(client.sessionId, { tokens: BURST, last: Date.now(), attackReadyAt: 0 });
    this.broadcast('fx', { kind: 'join', name: f.name });
  }

  onLeave(client: Client): void {
    this.state.fighters.delete(client.sessionId);
    this.priv.delete(client.sessionId);
  }

  // ------------------------------------------------------------- helpers

  private occupant(x: number, y: number, except?: string): [string, Gladiator] | null {
    for (const [id, f] of this.state.fighters.entries()) {
      if (id !== except && !f.ko && f.x === x && f.y === y) return [id, f];
    }
    return null;
  }

  private respawn(f: Gladiator): void {
    // the spawn farthest from everyone still standing
    const others = [...this.state.fighters.values()].filter((o) => o !== f && !o.ko);
    let best = ARENA_SPAWNS[0];
    let bestD = -1;
    for (const s of ARENA_SPAWNS) {
      const d = others.length ? Math.min(...others.map((o) => Math.abs(o.x - s[0]) + Math.abs(o.y - s[1]))) : Math.random() * 10;
      if (d > bestD) [best, bestD] = [s, d];
    }
    Object.assign(f, { x: best[0], y: best[1], hp: f.maxHp, ko: false, respawnAt: 0, shieldUntil: 0, stunUntil: 0 });
  }

  private damage(targetId: string, t: Gladiator, dmg: number, byId: string, cause: string): void {
    if (t.ko) return;
    const now = Date.now();
    const real = Math.max(1, Math.round(now < t.shieldUntil ? dmg * ARENA.shieldFactor : dmg));
    t.hp = Math.max(0, t.hp - real);
    this.broadcast('fx', { kind: 'hit', x: t.x, y: t.y, dmg: real, target: targetId });
    if (t.hp > 0) return;
    t.ko = true;
    t.falls += 1;
    t.respawnAt = now + ARENA.respawnMs;
    const by = this.state.fighters.get(byId);
    if (by && byId !== targetId) by.kos += 1;
    this.broadcast('ko', { target: targetId, targetName: t.name, by: byId, byName: by?.name ?? '?', cause });
  }

  private canAct(f: Gladiator | undefined): f is Gladiator {
    return !!f && !f.ko && Date.now() >= f.stunUntil;
  }

  // ------------------------------------------------------------- actions

  private onMove(client: Client, dir: number): void {
    const f = this.state.fighters.get(client.sessionId);
    const p = this.priv.get(client.sessionId);
    if (!f || !p) return;
    const now = Date.now();
    p.tokens = Math.min(BURST, p.tokens + (now - p.last) / STEP_MS);
    p.last = now;
    const [dx, dy] = DIRS[dir];
    const nx = f.x + dx, ny = f.y + dy;
    if (!this.canAct(f) || p.tokens < 1 || !arenaWalkable(nx, ny) || this.occupant(nx, ny, client.sessionId)) {
      client.send('reject', { x: f.x, y: f.y, dir: f.dir });
      return;
    }
    p.tokens -= 1;
    f.dir = dir;
    f.x = nx;
    f.y = ny;
    if (nx === ARENA_EXIT[0] && ny === ARENA_EXIT[1]) client.send('exit', {});
  }

  private onAttack(client: Client, dir: number): void {
    const f = this.state.fighters.get(client.sessionId);
    const p = this.priv.get(client.sessionId);
    const now = Date.now();
    if (!this.canAct(f) || !p || now < p.attackReadyAt) return;
    const a = fighterFor(f.cls).attack;
    p.attackReadyAt = now + a.cooldown;
    f.dir = dir;
    const [dx, dy] = DIRS[dir];
    if (a.kind === 'melee') {
      this.broadcast('fx', { kind: 'slash', x: f.x + dx, y: f.y + dy, dir, owner: client.sessionId });
      const hit = this.occupant(f.x + dx, f.y + dy, client.sessionId);
      if (hit) this.damage(hit[0], hit[1], a.dmg, client.sessionId, a.name);
      return;
    }
    this.fire(client.sessionId, a.kind, f.x, f.y, dir, a.range ?? 5, a.dmg, a.stepMs ?? 70);
  }

  private fire(owner: string, kind: string, x: number, y: number, dir: number, range: number, dmg: number, stepMs: number): void {
    const id = `s${++this.shotSeq}`;
    const s = new Projectile();
    Object.assign(s, { kind, x, y, dir, owner });
    this.state.shots.set(id, s);
    this.shotMeta.set(id, { range, dmg, stepMs, nextAt: Date.now() });
  }

  private onSpecial(client: Client, dir: number): void {
    const id = client.sessionId;
    const f = this.state.fighters.get(id);
    const now = Date.now();
    if (!this.canAct(f) || now < f.specialReadyAt) return;
    const sp = fighterFor(f.cls).special;
    f.specialReadyAt = now + sp.cooldown;
    f.dir = dir;
    const [dx, dy] = DIRS[dir];
    const near = (r: number) => [...this.state.fighters.entries()].filter(
      ([oid, o]) => oid !== id && !o.ko && Math.max(Math.abs(o.x - f.x), Math.abs(o.y - f.y)) <= r,
    );
    switch (sp.kind) {
      case 'nova':
        this.broadcast('fx', { kind: 'nova', x: f.x, y: f.y, owner: id });
        for (const [oid, o] of near(ARENA.novaRadius)) this.damage(oid, o, ARENA.novaDmg, id, sp.name);
        break;
      case 'charge': {
        let steps = 0;
        while (steps < ARENA.chargeTiles) {
          const nx = f.x + dx, ny = f.y + dy;
          if (!arenaWalkable(nx, ny) || this.occupant(nx, ny, id)) break;
          f.x = nx;
          f.y = ny;
          steps++;
        }
        this.broadcast('fx', { kind: 'charge', x: f.x, y: f.y, dir, owner: id });
        const hit = this.occupant(f.x + dx, f.y + dy, id);
        if (hit) this.damage(hit[0], hit[1], ARENA.chargeDmg, id, sp.name);
        if (f.x === ARENA_EXIT[0] && f.y === ARENA_EXIT[1]) client.send('exit', {});
        break;
      }
      case 'volley': {
        const a = fighterFor(f.cls).attack;
        const [px, py] = dx === 0 ? [1, 0] : [0, 1]; // perpendicular offsets
        for (const k of [-1, 0, 1]) {
          const sx = f.x + px * k, sy = f.y + py * k;
          if (k === 0 || arenaPassesShot(sx, sy)) this.fire(id, 'arrow', sx, sy, dir, a.range ?? 8, a.dmg, a.stepMs ?? 50);
        }
        break;
      }
      case 'heal':
        f.hp = Math.min(f.maxHp, f.hp + ARENA.heal);
        this.broadcast('fx', { kind: 'heal', x: f.x, y: f.y, owner: id });
        break;
      case 'shield':
        f.shieldUntil = now + ARENA.shieldMs;
        this.broadcast('fx', { kind: 'shield', x: f.x, y: f.y, owner: id });
        break;
      case 'discord':
        this.broadcast('fx', { kind: 'discord', x: f.x, y: f.y, owner: id });
        for (const [oid, o] of near(ARENA.discordRadius)) {
          o.stunUntil = now + ARENA.stunMs;
          this.damage(oid, o, ARENA.discordDmg, id, sp.name);
        }
        break;
    }
  }

  // ------------------------------------------------------------- simulation

  private tick(): void {
    const now = Date.now();
    for (const [id, s] of [...this.state.shots.entries()]) {
      const m = this.shotMeta.get(id)!;
      while (now >= m.nextAt) {
        m.nextAt += m.stepMs;
        const [dx, dy] = DIRS[s.dir];
        const nx = s.x + dx, ny = s.y + dy;
        if (m.range <= 0 || !arenaPassesShot(nx, ny)) {
          this.removeShot(id, nx, ny, !arenaPassesShot(nx, ny));
          break;
        }
        s.x = nx;
        s.y = ny;
        m.range -= 1;
        const hit = this.occupant(nx, ny, s.owner);
        if (hit) {
          const owner = this.state.fighters.get(s.owner);
          this.damage(hit[0], hit[1], m.dmg, s.owner, owner ? fighterFor(owner.cls).attack.name : 'stray shot');
          this.removeShot(id, nx, ny, false);
          break;
        }
      }
    }
    this.state.fighters.forEach((f) => {
      if (f.ko && now >= f.respawnAt) this.respawn(f);
    });
  }

  private removeShot(id: string, x: number, y: number, wall: boolean): void {
    const s = this.state.shots.get(id);
    if (s && wall) this.broadcast('fx', { kind: 'fizzle', x, y, shot: s.kind });
    this.state.shots.delete(id);
    this.shotMeta.delete(id);
  }
}
