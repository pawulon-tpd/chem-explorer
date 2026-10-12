import { Client, Room } from '@colyseus/core';
import { createHash } from 'node:crypto';
import {
  ASSAY_MS, claimShapeError, describeClaim, evaluateClaim, HIT, hasSkill, HYP, levelFor, quorum, SLOTS_PER_REGION, SYNTH_MS, XP,
  type Claim,
} from '../../shared/rules.js';
import type { ProgressStore } from './progress.js';
import { Crystal, Hypothesis, Note, Player, StanceVote, Vote, WorldState } from './state.js';
import type { World } from './world.js';

const CLASSES = ['wizard', 'warrior', 'ranger', 'healer', 'paladin', 'bard'];
const LIMITS = { tunic: 8, skin: 4, hair: 5 };
const DIRS: [number, number][] = [[0, 1], [-1, 0], [1, 0], [0, -1]];

// Token bucket per player: steady one step per STEP_MS, with a small burst so
// network jitter doesn't cause rejected (rubber-banded) steps.
const STEP_MS = 135;
const BURST = 3;

interface Bucket { tokens: number; last: number }

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const n = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  return n || 'Wanderer';
}

/** Single-line, control-character-free text, trimmed and capped. */
function cleanText(raw: unknown, max: number): string {
  return (typeof raw === 'string' ? raw : '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function idx(raw: unknown, max: number): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < max ? (raw as number) : 0;
}

/** Deterministic pseudo-random numbers in [0,1) from a string (stable across restarts). */
function unit(seed: string, k: number): number {
  return createHash('sha256').update(`${seed}:${k}`).digest().readUInt32BE(0) / 2 ** 32;
}

/** ~standard normal from a seed (Irwin–Hall with 4 uniforms). */
function gauss(seed: string): number {
  return ((unit(seed, 1) + unit(seed, 2) + unit(seed, 3) + unit(seed, 4)) - 2) * Math.sqrt(3);
}

export class WorldRoom extends Room<WorldState> {
  maxClients = 24;
  static world: World;
  static store: ProgressStore;
  static results: Record<string, number> = {};
  /** LAB_SPEED env var: >1 shortens synthesis/assay timers (demos, tests) */
  static labSpeed = 1;
  private buckets = new Map<string, Bucket>();
  private pidOf = new Map<string, string>(); // sessionId -> pid
  private lastNote = new Map<string, number>(); // pid -> epoch ms, rate limit

  // ------------------------------------------------------------- lifecycle

  onCreate(): void {
    this.setState(new WorldState());
    this.restoreCrystals();
    this.restoreHypotheses();

    this.onMessage('move', (client, msg: { dir?: unknown }) => this.onMove(client, idx(msg?.dir, 4)));
    this.onMessage('face', (client, msg: { dir?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.dir = idx(msg?.dir, 4);
    });
    this.onMessage('reading', (client, msg: { id?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = typeof msg?.id === 'string' ? msg.id : '';
      p.reading = WorldRoom.world.compoundIds.has(id) ? id : '';
    });
    this.onMessage('vote', (client, msg: { id?: unknown; choice?: unknown }) => this.onVote(client, msg));
    this.onMessage('clock', (client) => client.send('clock', { now: Date.now() }));
    this.onMessage('insight', (client, msg: { id?: unknown }) => this.onInsight(client, msg));
    this.onMessage('propose', (client, msg: Record<string, unknown>) => this.onPropose(client, msg));
    this.onMessage('stance', (client, msg: { id?: unknown; stance?: unknown }) => this.onStance(client, msg));
    this.onMessage('note', (client, msg: { id?: unknown; text?: unknown }) => this.onNote(client, msg));
    this.onMessage('abandon', (client, msg: { id?: unknown }) => this.onAbandon(client, msg));

    this.clock.setInterval(() => this.tick(), 1000);
  }

  onJoin(client: Client, options: Record<string, unknown> = {}): void {
    const w = WorldRoom.world;
    const store = WorldRoom.store.data;
    const token = typeof options.token === 'string' && /^[\w-]{16,128}$/.test(options.token) ? options.token : null;
    // progress is keyed by a hash of the private token; the token itself is never shared
    const pid = createHash('sha256').update(token ?? `${client.sessionId}:${Math.random()}`).digest('hex').slice(0, 16);

    const p = new Player();
    p.pid = pid;
    p.name = cleanName(options.name);
    p.cls = CLASSES.includes(options.cls as string) ? (options.cls as string) : 'wizard';
    p.tunic = idx(options.tunic, LIMITS.tunic);
    p.skin = idx(options.skin, LIMITS.skin);
    p.hair = idx(options.hair, LIMITS.hair);

    const sp = (store.players[pid] ??= { name: p.name, cls: p.cls, xp: 0, calls: 0, correct: 0, supported: 0, refuted: 0 });
    sp.name = p.name;
    sp.cls = p.cls;
    p.xp = sp.xp;
    p.level = levelFor(sp.xp);
    p.calls = sp.calls;
    p.correct = sp.correct;
    p.supported = sp.supported ?? 0;
    p.refuted = sp.refuted ?? 0;
    WorldRoom.store.save();

    // least crowded of the nearest spawn tiles
    const crowd = (x: number, y: number) => [...this.state.players.values()].filter((o) => o.x === x && o.y === y).length;
    const choices = w.spawns.slice(0, 6);
    const [x, y] = choices.reduce((best, s) => (crowd(...s) < crowd(...best) ? s : best), choices[Math.floor(Math.random() * choices.length)]);
    p.x = x;
    p.y = y;
    this.state.players.set(client.sessionId, p);
    this.pidOf.set(client.sessionId, pid);
    this.buckets.set(client.sessionId, { tokens: BURST, last: Date.now() });
    console.log(`[room] ${p.name} the ${p.cls} (lv ${p.level}) joined (${this.clients.length} online)`);
  }

  onLeave(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.buckets.delete(client.sessionId);
    this.pidOf.delete(client.sessionId);
    console.log(`[room] ${p?.name ?? client.sessionId} left (${this.clients.length} online)`);
  }

  onDispose(): void {
    WorldRoom.store.flush();
  }

  // ------------------------------------------------------------- movement

  private onMove(client: Client, dir: number): void {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const b = this.buckets.get(client.sessionId)!;
    const now = Date.now();
    b.tokens = Math.min(BURST, b.tokens + (now - b.last) / STEP_MS);
    b.last = now;
    const [dx, dy] = DIRS[dir];
    if (b.tokens < 1 || !WorldRoom.world.passable(p.x + dx, p.y + dy)) {
      client.send('reject', { x: p.x, y: p.y, dir: p.dir });
      return;
    }
    b.tokens -= 1;
    p.dir = dir;
    p.x += dx;
    p.y += dy;
  }

  // ------------------------------------------------------------- crystals / council

  private restoreCrystals(): void {
    const { world, store } = { world: WorldRoom.world, store: WorldRoom.store.data };
    for (const id of world.compoundIds) {
      const c = new Crystal();
      const known = world.knownPIC50.get(id) ?? null;
      const saved = store.crystals[id];
      if (known !== null) {
        c.status = 'tested';
        c.pIC50 = known;
      } else if (saved) {
        c.status = saved.status;
        c.startedAt = saved.startedAt;
        c.readyAt = saved.readyAt;
        c.pIC50 = saved.pIC50 ?? -1;
        for (const [pid, v] of Object.entries(saved.votes)) {
          const vote = new Vote();
          Object.assign(vote, v);
          c.votes.set(pid, vote);
        }
      }
      this.state.crystals.set(id, c);
    }
  }

  private persist(id: string): void {
    const c = this.state.crystals.get(id)!;
    const votes: Record<string, { name: string; cls: string; choice: string }> = {};
    c.votes.forEach((v, pid) => (votes[pid] = { name: v.name, cls: v.cls, choice: v.choice }));
    WorldRoom.store.data.crystals[id] = {
      status: c.status, startedAt: c.startedAt, readyAt: c.readyAt, pIC50: c.pIC50 >= 0 ? c.pIC50 : null, votes,
    };
    WorldRoom.store.save();
  }

  private onVote(client: Client, msg: { id?: unknown; choice?: unknown }): void {
    const p = this.state.players.get(client.sessionId);
    const id = typeof msg?.id === 'string' ? msg.id : '';
    const c = this.state.crystals.get(id);
    if (!p || !c || c.status !== 'untested') return; // votes lock once approved
    if (msg.choice === 'for' || msg.choice === 'against') {
      const v = new Vote();
      Object.assign(v, { name: p.name, cls: p.cls, choice: msg.choice });
      c.votes.set(p.pid, v);
    } else {
      c.votes.delete(p.pid);
    }
    this.persist(id);
    this.checkApproval(id);
  }

  private tally(c: Crystal): number {
    let net = 0;
    c.votes.forEach((v) => (net += v.choice === 'for' ? 1 : -1));
    return net;
  }

  private checkApproval(id: string): void {
    const c = this.state.crystals.get(id)!;
    if (c.status !== 'untested' || this.tally(c) < quorum(this.clients.length)) return;
    c.status = 'queued';
    c.startedAt = Date.now(); // queue order
    this.persist(id);
    this.broadcast('council', { id, event: 'approved' });
    this.startQueued();
  }

  private online(): Player[] {
    return [...this.state.players.values()];
  }

  private onlineSkill(skill: Parameters<typeof hasSkill>[2]): boolean {
    return this.online().some((p) => hasSkill(p.cls, p.level, skill));
  }

  private synthFactor(c: Crystal): number {
    let f = 1;
    c.votes.forEach((v, pid) => {
      if (v.choice !== 'for') return;
      const sp = WorldRoom.store.data.players[pid];
      if (!sp) return;
      const lvl = levelFor(sp.xp);
      if (hasSkill(sp.cls, lvl, 'master_smith')) f = Math.max(f, 3);
      else if (hasSkill(sp.cls, lvl, 'swift_forge')) f = Math.max(f, 2);
    });
    return f;
  }

  private assayFactor(): number {
    if (this.onlineSkill('clean_signal')) return 3;
    if (this.onlineSkill('purify')) return 2;
    return 1;
  }

  private startQueued(): void {
    const w = WorldRoom.world;
    const slots = SLOTS_PER_REGION + (this.onlineSkill('rally') ? 1 : 0);
    const busy = new Map<number, number>();
    this.state.crystals.forEach((c, id) => {
      if (c.status === 'synthesising') busy.set(w.regionOf.get(id)!, (busy.get(w.regionOf.get(id)!) ?? 0) + 1);
    });
    const queued = [...this.state.crystals.entries()].filter(([, c]) => c.status === 'queued').sort((a, b) => a[1].startedAt - b[1].startedAt);
    const now = Date.now();
    for (const [id, c] of queued) {
      const r = w.regionOf.get(id)!;
      if ((busy.get(r) ?? 0) >= slots) continue;
      busy.set(r, (busy.get(r) ?? 0) + 1);
      c.status = 'synthesising';
      c.startedAt = now;
      c.readyAt = now + SYNTH_MS / this.synthFactor(c) / WorldRoom.labSpeed;
      this.persist(id);
    }
  }

  private tick(): void {
    const now = Date.now();
    this.state.crystals.forEach((c, id) => {
      if (c.status === 'synthesising' && now >= c.readyAt) {
        c.status = 'assaying';
        c.startedAt = now;
        c.readyAt = now + ASSAY_MS / this.assayFactor() / WorldRoom.labSpeed;
        this.persist(id);
      } else if (c.status === 'assaying' && now >= c.readyAt) {
        this.reveal(id);
      } else if (c.status === 'untested' && c.votes.size && this.clients.length > 0) {
        this.checkApproval(id); // quorum drops when players leave (but nobody online decides nothing)
      }
    });
    this.startQueued();
  }

  private truth(id: string): number {
    const r = WorldRoom.results[id];
    return typeof r === 'number' ? r : Math.round((4.5 + unit(id, 0) * 4) * 10) / 10;
  }

  private reveal(id: string): void {
    const c = this.state.crystals.get(id)!;
    const p = this.truth(id);
    c.status = 'tested';
    c.pIC50 = p;
    const hit = p >= HIT;
    const inspire = this.onlineSkill('inspire') ? 1 + XP.inspireBonus : 1;
    c.votes.forEach((v, pid) => {
      const correct = (v.choice === 'for') === hit;
      const base = correct ? (v.choice === 'for' ? XP.hitCalled : XP.missCalled) : XP.learned;
      const reason = correct
        ? v.choice === 'for' ? `you called ${id} a hit` : `you called ${id} a miss`
        : `${id} went the other way; you learned something`;
      this.award(pid, Math.round(base * inspire), reason, { call: correct });
    });
    this.persist(id);
    this.broadcast('reveal', { id, pIC50: p, hit });
    this.onCrystalRevealed(id);
  }

  /** opts.call: a crystal call (counts toward calibration, true = correct);
   *  opts.authored: the player's own hypothesis resolved this way. */
  private award(pid: string, gain: number, reason: string, opts: { call?: boolean; authored?: 'supported' | 'refuted' } = {}): void {
    const sp = WorldRoom.store.data.players[pid];
    if (!sp) return;
    const before = levelFor(sp.xp);
    sp.xp += gain;
    if (opts.call !== undefined) {
      sp.calls += 1;
      if (opts.call) sp.correct += 1;
    }
    if (opts.authored) sp[opts.authored] = (sp[opts.authored] ?? 0) + 1;
    const level = levelFor(sp.xp);
    WorldRoom.store.save();
    for (const client of this.clients) {
      if (this.pidOf.get(client.sessionId) !== pid) continue;
      const p = this.state.players.get(client.sessionId);
      if (p) Object.assign(p, { xp: sp.xp, level, calls: sp.calls, correct: sp.correct, supported: sp.supported ?? 0, refuted: sp.refuted ?? 0 });
      client.send('xp', { gain, reason, xp: sp.xp, level, leveledUp: level > before });
    }
  }

  // ------------------------------------------------------------- hypotheses (quests)

  private restoreHypotheses(): void {
    for (const [id, h] of Object.entries(WorldRoom.store.data.hypotheses ?? {})) {
      const hyp = new Hypothesis();
      Object.assign(hyp, {
        statement: h.statement, claim: h.claim, land: h.land, authorPid: h.author.pid, authorName: h.author.name,
        authorCls: h.author.cls, createdAt: h.createdAt, status: h.status, resolvedAt: h.resolvedAt, revealed: h.revealed,
      });
      hyp.crystals.push(...h.crystals);
      for (const [pid, st] of Object.entries(h.stances)) {
        const v = new StanceVote();
        Object.assign(v, st);
        hyp.stances.set(pid, v);
      }
      for (const n of h.notes) {
        const note = new Note();
        Object.assign(note, n);
        hyp.notes.push(note);
      }
      this.state.hypotheses.set(id, hyp);
    }
  }

  private persistHypothesis(id: string): void {
    const h = this.state.hypotheses.get(id)!;
    const stances: Record<string, { name: string; cls: string; stance: string }> = {};
    h.stances.forEach((v, pid) => (stances[pid] = { name: v.name, cls: v.cls, stance: v.stance }));
    (WorldRoom.store.data.hypotheses ??= {})[id] = {
      statement: h.statement, claim: h.claim, crystals: [...h.crystals], land: h.land,
      author: { pid: h.authorPid, name: h.authorName, cls: h.authorCls },
      createdAt: h.createdAt, status: h.status, resolvedAt: h.resolvedAt, revealed: h.revealed,
      stances, notes: h.notes.map((n) => ({ name: n.name, cls: n.cls, text: n.text, at: n.at })),
    };
    WorldRoom.store.save();
  }

  private onPropose(client: Client, msg: Record<string, unknown>): void {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const fail = (error: string) => client.send('propose-result', { ok: false, error });
    const w = WorldRoom.world;
    const statement = cleanText(msg.statement, HYP.statementMax);
    const claim = msg.claim as Claim;
    const crystals = Array.isArray(msg.crystals) ? msg.crystals.filter((c): c is string => typeof c === 'string') : [];
    if (statement.length < HYP.statementMin) return fail(`Write the rationale in at least ${HYP.statementMin} characters.`);
    const shape = claimShapeError(claim, crystals);
    if (shape) return fail(shape);
    if (!crystals.every((c) => w.compoundIds.has(c))) return fail('Unknown crystal.');
    const lands = new Set(crystals.map((c) => w.regionOf.get(c)));
    if (lands.size !== 1) return fail('All crystals must be in the same land.');
    const untested = crystals.filter((c) => this.state.crystals.get(c)?.status !== 'tested');
    if (!untested.length) return fail('Name at least one untested crystal; otherwise the answer is already known.');
    if (claim === 'beats' && this.state.crystals.get(crystals[0])?.status === 'tested' && this.state.crystals.get(crystals[1])?.status === 'tested') {
      return fail('At least one of the two crystals must be untested.');
    }
    let open = 0;
    this.state.hypotheses.forEach((h) => (open += h.authorPid === p.pid && h.status === 'open' ? 1 : 0));
    if (open >= HYP.maxOpenPerAuthor) return fail(`You already have ${HYP.maxOpenPerAuthor} open hypotheses. Resolve or abandon one first.`);

    const store = WorldRoom.store.data;
    const id = `H${(store.nextHypothesis = (store.nextHypothesis ?? 0) + 1)}`;
    const h = new Hypothesis();
    Object.assign(h, {
      statement, claim, land: [...lands][0] ?? 0, authorPid: p.pid, authorName: p.name, authorCls: p.cls,
      createdAt: Date.now(), status: 'open',
    });
    h.crystals.push(...crystals);
    // the author implicitly believes their own claim
    const own = new StanceVote();
    Object.assign(own, { name: p.name, cls: p.cls, stance: 'believe' });
    h.stances.set(p.pid, own);
    this.state.hypotheses.set(id, h);
    this.persistHypothesis(id);
    client.send('propose-result', { ok: true, id });
    this.broadcast('quest', { id, event: 'proposed', text: `${p.name} proposed ${id}: ${describeClaim(claim, crystals)}` });
  }

  private onStance(client: Client, msg: { id?: unknown; stance?: unknown }): void {
    const p = this.state.players.get(client.sessionId);
    const id = typeof msg?.id === 'string' ? msg.id : '';
    const h = this.state.hypotheses.get(id);
    if (!p || !h || h.status !== 'open' || h.revealed > 0 || h.authorPid === p.pid) return; // locked once evidence arrives
    if (msg.stance === 'believe' || msg.stance === 'doubt') {
      const v = new StanceVote();
      Object.assign(v, { name: p.name, cls: p.cls, stance: msg.stance });
      h.stances.set(p.pid, v);
    } else {
      h.stances.delete(p.pid);
    }
    this.persistHypothesis(id);
  }

  private onNote(client: Client, msg: { id?: unknown; text?: unknown }): void {
    const p = this.state.players.get(client.sessionId);
    const id = typeof msg?.id === 'string' ? msg.id : '';
    const h = this.state.hypotheses.get(id);
    const text = cleanText(msg?.text, HYP.noteMax);
    if (!p || !h || !text || h.notes.length >= HYP.maxNotes) return;
    const now = Date.now();
    if (now - (this.lastNote.get(p.pid) ?? 0) < 5000) return;
    this.lastNote.set(p.pid, now);
    const n = new Note();
    Object.assign(n, { name: p.name, cls: p.cls, text, at: now });
    h.notes.push(n);
    this.persistHypothesis(id);
  }

  private onAbandon(client: Client, msg: { id?: unknown }): void {
    const p = this.state.players.get(client.sessionId);
    const id = typeof msg?.id === 'string' ? msg.id : '';
    const h = this.state.hypotheses.get(id);
    if (!p || !h || h.authorPid !== p.pid || h.status !== 'open' || h.revealed > 0) return;
    h.status = 'abandoned';
    h.resolvedAt = Date.now();
    this.persistHypothesis(id);
  }

  /** Update every open hypothesis naming this crystal; resolve those now fully tested. */
  private onCrystalRevealed(crystalId: string): void {
    this.state.hypotheses.forEach((h, id) => {
      if (h.status !== 'open' || !h.crystals.includes(crystalId)) return;
      h.revealed += 1;
      const potencies = [...h.crystals].map((c) => {
        const x = this.state.crystals.get(c);
        return x && x.status === 'tested' && x.pIC50 >= 0 ? x.pIC50 : null;
      });
      const held = evaluateClaim(h.claim as Claim, potencies);
      if (held === null) {
        this.persistHypothesis(id);
        return;
      }
      h.status = held ? 'supported' : 'refuted';
      h.resolvedAt = Date.now();
      this.persistHypothesis(id);
      const what = describeClaim(h.claim as Claim, [...h.crystals]);
      this.broadcast('quest', { id, event: h.status, text: `${id} ${held ? 'supported' : 'refuted'}: ${what}` });
      this.award(h.authorPid, held ? HYP.supported : HYP.refuted,
        held ? `your hypothesis ${id} was supported` : `your hypothesis ${id} was refuted (still knowledge)`,
        { authored: held ? 'supported' : 'refuted' });
      h.stances.forEach((v, pid) => {
        if (pid === h.authorPid) return;
        const right = (v.stance === 'believe') === held;
        this.award(pid, right ? HYP.stanceRight : HYP.stanceWrong, right ? `you read ${id} right` : `${id} went against your stance`);
      });
    });
  }

  /** Skill-gated private information about a crystal. */
  private onInsight(client: Client, msg: { id?: unknown }): void {
    const p = this.state.players.get(client.sessionId);
    const id = typeof msg?.id === 'string' ? msg.id : '';
    const c = this.state.crystals.get(id);
    if (!p || !c) return;
    const out: { id: string; foresight?: { mean: number; sd: number }; readout?: { lo: number; hi: number } } = { id };
    if (c.status !== 'tested' && hasSkill(p.cls, p.level, 'foresight')) {
      const sd = hasSkill(p.cls, p.level, 'sharp_sight') ? 0.35 : 0.7;
      out.foresight = { mean: Math.round((this.truth(id) + gauss(`oracle:${id}`) * sd) * 10) / 10, sd };
    }
    if (c.status === 'assaying' && hasSkill(p.cls, p.level, 'early_readout')) {
      const half = hasSkill(p.cls, p.level, 'trial_master') ? 0.25 : 0.6;
      const centre = this.truth(id) + (unit(`readout:${id}`, 0) - 0.5) * half;
      out.readout = { lo: Math.round((centre - half) * 10) / 10, hi: Math.round((centre + half) * 10) / 10 };
    }
    client.send('insight', out);
  }
}
