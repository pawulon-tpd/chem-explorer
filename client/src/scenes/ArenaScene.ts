import Phaser from 'phaser';
import { ARENA, ARENA_EXIT, ARENA_H, ARENA_W, arenaCell, arenaWalkable, DIRS, fighterFor } from '../../../shared/arena';
import { ATEX, FLOOR_VARIANTS, generateArenaTextures, PORTAL_FRAMES } from '../gfx/arenaTextures';
import { ensureHeroTextures, generateTextures, TEX, TILE } from '../gfx/textures';
import { ArenaSession, type FighterView, type Fx, type KoEvent, type ShotView } from '../net/arenaSession';
import type { Profile } from '../net/session';
import { ArenaHud } from '../ui/arenaHud';

const ZOOM = 3;
const STEP_MS = 150;
const UI = 100000;
const centre = (t: number) => t * TILE + TILE / 2;
const feet = (t: number) => (t + 1) * TILE - 2;
const ySort = (bottomPx: number) => 100 + bottomPx;

export interface ArenaInit {
  profile: Profile;
  level: number;
  /** Called once when the player leaves; reason is shown as a toast in the world. */
  onExit: (reason?: string) => void;
}

interface Body {
  view: FighterView;
  sprite: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Graphics;
  shield: Phaser.GameObjects.Arc;
  stun: Phaser.GameObjects.Text;
  x: number;
  y: number;
  frame: number;
}

/** Free-for-all arena realm. All combat is resolved by the server (ArenaRoom). */
export class ArenaScene extends Phaser.Scene {
  private cfg!: ArenaInit;
  private session: ArenaSession | null = null;
  private bodies = new Map<string, Body>();
  private shots = new Map<string, Phaser.GameObjects.Image>();
  private selfId = '';
  private moving = false;
  private queuedDir: number | null = null;
  private lastLocalMove = 0;
  private attackReadyAt = 0;
  private leaving = false;
  private koBy: string | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private hud!: ArenaHud;

  constructor() {
    super('arena');
  }

  init(data: ArenaInit): void {
    // the scene object is reused on every visit, so reset everything
    this.cfg = data;
    this.session = null;
    this.bodies = new Map();
    this.shots = new Map();
    this.selfId = '';
    this.moving = false;
    this.queuedDir = null;
    this.attackReadyAt = 0;
    this.leaving = false;
    this.koBy = null;
  }

  create(): void {
    generateTextures(this);
    generateArenaTextures(this);
    this.buildMap();
    this.hud = new ArenaHud(() => this.leave());
    this.hud.show(this.cfg.profile.cls);
    this.hud.setBars(null, 0, 0, 0);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x1a1410).setRoundPixels(true);
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitCamera, this));
    cam.fadeIn(300, 0, 0, 0);
    this.bindInput();

    void ArenaSession.connect({ ...this.cfg.profile, level: this.cfg.level }, {
      fighter: (f, self, added) => this.onFighter(f, self, added),
      fighterGone: (id) => this.removeBody(id),
      shot: (s, added) => this.onShot(s, added),
      shotGone: (id) => {
        this.shots.get(id)?.destroy();
        this.shots.delete(id);
      },
      fx: (m) => this.onFx(m),
      ko: (m) => this.onKo(m),
      reject: (x, y, dir) => this.snapSelf(x, y, dir),
      exit: () => this.leave(),
      disconnected: () => this.leave('Lost connection to the arena.'),
    }).then((s) => {
      if (!this.scene.isActive()) {
        s?.leave();
        return;
      }
      if (!s) return this.leave('The arena gate is closed: the realm server is not reachable.');
      this.session = s;
      this.selfId = s.selfId;
    });
  }

  /**
   * Show the whole arena when it fits (with a margin so the HUD panels don't
   * cover the corner spawns); otherwise follow the player at the normal zoom.
   */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const w = ARENA_W * TILE, h = ARENA_H * TILE;
    const marginX = 4 * TILE, marginTop = 5 * TILE, marginBottom = 3 * TILE;
    const fit = Math.min(this.scale.width / (w + marginX), this.scale.height / (h + marginTop + marginBottom));
    if (fit >= 2) {
      cam.stopFollow();
      cam.removeBounds();
      cam.setZoom(Math.min(ZOOM, fit));
      cam.centerOn(w / 2, h / 2 - (marginTop - marginBottom) / 2);
    } else {
      cam.setBounds(-marginX / 2, -marginTop, w + marginX, h + marginTop + marginBottom).setZoom(ZOOM);
      const me = this.me();
      if (me) cam.startFollow(me.sprite, true, 1, 1, 0, -6);
    }
  }

  // ------------------------------------------------------------- map

  private buildMap(): void {
    const key = 'arena_ground';
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = ARENA_W * TILE;
      c.height = ARENA_H * TILE;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const draw = (k: string, x: number, y: number) => ctx.drawImage(this.textures.get(k).getSourceImage() as CanvasImageSource, x * TILE, y * TILE);
      for (let y = 0; y < ARENA_H; y++) {
        for (let x = 0; x < ARENA_W; x++) {
          if (arenaCell(x, y) === '#') draw(arenaCell(x, y + 1) === '#' ? ATEX.wallTop : ATEX.wall, x, y);
          else draw(ATEX.floor((((x * 73856093) ^ (y * 19349663)) >>> 0) % FLOOR_VARIANTS), x, y);
        }
      }
      // sand ring in the middle of the pit
      ctx.fillStyle = 'rgba(214, 186, 128, 0.35)';
      ctx.beginPath();
      ctx.ellipse((ARENA_W * TILE) / 2, (ARENA_H * TILE) / 2, 60, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      this.textures.addCanvas(key, c);
    }
    this.add.image(0, 0, key).setOrigin(0).setDepth(0);

    for (let y = 0; y < ARENA_H; y++) {
      for (let x = 0; x < ARENA_W; x++) {
        const cell = arenaCell(x, y);
        const bottom = (y + 1) * TILE;
        if (cell === 'O') this.add.image(centre(x), bottom, ATEX.pillar).setOrigin(0.5, 1).setDepth(ySort(bottom - 1));
        if (cell === 'B') {
          const b = this.add.image(centre(x), bottom, ATEX.brazier(0)).setOrigin(0.5, 1).setDepth(ySort(bottom - 1));
          let f = 0;
          this.time.addEvent({ delay: 180, loop: true, callback: () => b.setTexture(ATEX.brazier((f = 1 - f))) });
        }
      }
    }
    const [ex, ey] = ARENA_EXIT;
    const portal = this.add.image(centre(ex), (ey + 1) * TILE, ATEX.portal(0)).setOrigin(0.5, 1).setDepth(ySort((ey + 1) * TILE - 1));
    let pf = 0;
    this.time.addEvent({ delay: 160, loop: true, callback: () => portal.setTexture(ATEX.portal((pf = (pf + 1) % PORTAL_FRAMES))) });
    this.add
      .text(centre(ex), ey * TILE - 18, 'EXIT', { fontFamily: '"Pixelify Sans", monospace', fontSize: '7px', color: '#bfe6ff', stroke: '#0a1a33', strokeThickness: 2, resolution: 8 })
      .setOrigin(0.5, 1)
      .setDepth(UI);
  }

  // ------------------------------------------------------------- fighters

  private onFighter(f: FighterView, self: boolean, added: boolean): void {
    if (!this.sys.isActive()) return;
    if (self) this.selfId = f.id;
    if (added) this.createBody(f, self);
    const b = this.bodies.get(f.id);
    if (!b) return;
    const prev = b.view;
    b.view = f;
    // KO / respawn visuals
    if (f.ko !== prev.ko || added) {
      b.sprite.setAlpha(f.ko ? 0.35 : 1).setAngle(f.ko ? 90 : 0);
      if (f.ko) b.sprite.setTint(0x9a9a9a);
      else b.sprite.clearTint();
    }
    const respawned = prev.ko && !f.ko;
    if (self) {
      // server-driven moves we did not predict: respawn, charge, or a lagging correction
      const off = f.x !== b.x || f.y !== b.y;
      if (added || respawned || (off && !this.moving && performance.now() - this.lastLocalMove > 350)) this.moveBody(b, f.x, f.y, f.dir, added || respawned);
      if (respawned) {
        this.koBy = null;
        this.hud.setKo(null, 0);
        this.cameras.main.flash(250, 255, 255, 255);
      }
    } else if (f.x !== b.x || f.y !== b.y) {
      this.moveBody(b, f.x, f.y, f.dir, respawned || Math.abs(f.x - b.x) + Math.abs(f.y - b.y) > 1);
    } else if (f.dir !== prev.dir && !f.ko) {
      b.sprite.setTexture(TEX.hero(b.view, f.dir, 0));
    }
    this.drawHp(b);
    this.hud.setBoard([...this.bodies.values()].map((x) => x.view), this.selfId);
  }

  private createBody(f: FighterView, self: boolean): void {
    ensureHeroTextures(this, f);
    const sprite = this.add.sprite(centre(f.x), feet(f.y), TEX.hero(f, f.dir, 0)).setOrigin(0.5, 1).setDepth(ySort(feet(f.y) + 1));
    const tag = this.add
      .text(centre(f.x), feet(f.y) - 26, `Lv${f.level} ${f.name}`, {
        fontFamily: '"Pixelify Sans", ui-sans-serif, sans-serif', fontSize: '6px', color: self ? '#ffe28a' : '#ffffff',
        stroke: '#1a1020', strokeThickness: 2, resolution: 8,
      })
      .setOrigin(0.5, 1)
      .setDepth(UI);
    const hp = this.add.graphics().setDepth(UI);
    const shield = this.add.circle(0, 0, 11, 0x8fd8ff, 0.18).setStrokeStyle(1, 0xcff2ff, 0.9).setDepth(UI - 1).setVisible(false);
    const stun = this.add.text(0, 0, '✦ ✦', { fontSize: '6px', color: '#f6e27a', resolution: 8 }).setOrigin(0.5, 1).setDepth(UI).setVisible(false);
    const b: Body = { view: f, sprite, tag, hp, shield, stun, x: f.x, y: f.y, frame: 0 };
    this.bodies.set(f.id, b);
    this.place(b, centre(f.x), feet(f.y));
    if (self) this.fitCamera();
    if (!self) this.hud.log(`${f.name} entered the arena`);
  }

  private place(b: Body, px: number, py: number): void {
    b.sprite.setPosition(px, py).setDepth(ySort(py + 1));
    b.tag.setPosition(px, py - 26);
    b.shield.setPosition(px, py - 10);
    b.stun.setPosition(px, py - 30);
    this.drawHp(b);
  }

  private drawHp(b: Body): void {
    const { hp, maxHp, ko } = b.view;
    const x = b.sprite.x - 8, y = b.sprite.y - 25;
    b.hp.clear();
    if (ko) return;
    const frac = Math.max(0, hp / maxHp);
    b.hp.fillStyle(0x1a1208, 0.85).fillRect(x - 1, y - 1, 18, 4);
    b.hp.fillStyle(frac > 0.5 ? 0x6ad06a : frac > 0.25 ? 0xf2c14e : 0xe0503a, 1).fillRect(x, y, Math.round(16 * frac), 2);
  }

  private moveBody(b: Body, x: number, y: number, dir: number, instant: boolean): void {
    this.tweens.killTweensOf(b.sprite);
    const from = { x: b.sprite.x, y: b.sprite.y };
    const to = { x: centre(x), y: feet(y) };
    b.x = x;
    b.y = y;
    if (instant) {
      b.sprite.setTexture(TEX.hero(b.view, dir, 0));
      this.place(b, to.x, to.y);
      return;
    }
    b.frame = b.frame === 1 ? 2 : 1;
    b.sprite.setTexture(TEX.hero(b.view, dir, b.frame));
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: STEP_MS,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 1;
        this.place(b, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      },
      onComplete: () => b.sprite.setTexture(TEX.hero(b.view, dir, 0)),
    });
  }

  private removeBody(id: string): void {
    const b = this.bodies.get(id);
    if (!b) return;
    for (const o of [b.sprite, b.tag, b.hp, b.shield, b.stun]) o.destroy();
    this.bodies.delete(id);
    this.hud.log(`${b.view.name} left the arena`);
    this.hud.setBoard([...this.bodies.values()].map((x) => x.view), this.selfId);
  }

  private snapSelf(x: number, y: number, dir: number): void {
    const b = this.bodies.get(this.selfId);
    if (!b) return;
    this.moving = false;
    this.moveBody(b, x, y, dir, true);
  }

  // ------------------------------------------------------------- projectiles + effects

  private onShot(s: ShotView, added: boolean): void {
    const key = s.kind === 'arrow' ? ATEX.arrow : s.kind === 'note' ? ATEX.note : ATEX.bolt;
    let img = this.shots.get(s.id);
    if (added || !img) {
      img = this.add.image(centre(s.x), centre(s.y) - 4, key).setDepth(UI - 5);
      if (s.kind === 'arrow') img.setAngle([90, 180, 0, -90][s.dir]);
      if (s.kind === 'bolt') this.tweens.add({ targets: img, scale: { from: 0.8, to: 1.15 }, duration: 120, yoyo: true, repeat: -1 });
      this.shots.set(s.id, img);
      return;
    }
    this.tweens.add({ targets: img, x: centre(s.x), y: centre(s.y) - 4, duration: 60 });
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(centre(x), y * TILE - 2, text, { fontFamily: '"Pixelify Sans", monospace', fontSize: '8px', color, stroke: '#1a0a05', strokeThickness: 2, resolution: 8 })
      .setOrigin(0.5, 1)
      .setDepth(UI + 1);
    this.tweens.add({ targets: t, y: t.y - 12, alpha: { from: 1, to: 0 }, duration: 800, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private ring(x: number, y: number, colour: number, radius: number): void {
    const r = this.add.circle(centre(x), centre(y), 4, colour, 0.15).setStrokeStyle(2, colour, 1).setDepth(UI - 2);
    this.tweens.add({ targets: r, radius, alpha: { from: 1, to: 0 }, duration: 450, ease: 'Cubic.out', onComplete: () => r.destroy() });
  }

  private onFx(m: Fx): void {
    if (!this.sys.isActive()) return;
    const x = m.x ?? 0, y = m.y ?? 0;
    switch (m.kind) {
      case 'hit': {
        this.floatText(x, y, `-${m.dmg}`, m.target === this.selfId ? '#ff7a6a' : '#ffe28a');
        const b = m.target ? this.bodies.get(m.target) : undefined;
        if (b) {
          b.sprite.setTintFill(0xffffff);
          this.time.delayedCall(80, () => (b.view.ko ? b.sprite.setTint(0x9a9a9a) : b.sprite.clearTint()));
        }
        if (m.target === this.selfId) this.cameras.main.shake(120, 0.004);
        break;
      }
      case 'slash': {
        const g = this.add.graphics().setDepth(UI - 2);
        const angle = [90, 180, 0, 270][m.dir ?? 0];
        g.lineStyle(2, 0xffffff, 0.9);
        g.beginPath();
        g.arc(centre(x), centre(y), 7, Phaser.Math.DegToRad(angle - 60), Phaser.Math.DegToRad(angle + 60));
        g.strokePath();
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        if (m.owner) this.lunge(m.owner, m.dir ?? 0);
        break;
      }
      case 'nova':
        this.ring(x, y, 0xf6a531, (ARENA.novaRadius + 0.5) * TILE);
        this.ring(x, y, 0xe0522a, (ARENA.novaRadius + 0.2) * TILE);
        break;
      case 'discord':
        this.ring(x, y, 0xb07cf0, (ARENA.discordRadius + 0.5) * TILE);
        this.floatText(x, y, '♪ ♫ ♪', '#d8b4ff');
        break;
      case 'heal':
        this.floatText(x, y, `+${ARENA.heal}`, '#8ff08f');
        this.ring(x, y, 0x8ff08f, 12);
        break;
      case 'shield':
        this.ring(x, y, 0x8fd8ff, 12);
        break;
      case 'charge':
        this.ring(x, y, 0xd9c9a3, 10);
        if (m.owner === this.selfId) {
          const b = this.bodies.get(this.selfId);
          if (b) this.moveBody(b, x, y, m.dir ?? 0, false);
        }
        break;
      case 'fizzle':
        this.ring(x, y, 0xcccccc, 5);
        break;
    }
  }

  private lunge(id: string, dir: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    const [dx, dy] = DIRS[dir];
    this.tweens.add({ targets: b.sprite, x: b.sprite.x + dx * 3, y: b.sprite.y + dy * 3, duration: 60, yoyo: true });
  }

  private onKo(m: KoEvent): void {
    const mine = m.target === this.selfId || m.by === this.selfId;
    const text = m.target === m.by ? `${m.targetName} fell` : `${m.byName} knocked out ${m.targetName} (${m.cause})`;
    this.hud.log(text, mine);
    const b = this.bodies.get(m.target);
    if (b) this.floatText(b.x, b.y, 'KO!', '#ff4a3a');
    if (m.target === this.selfId) {
      this.koBy = m.byName;
      this.cameras.main.shake(250, 0.01);
    }
  }

  // ------------------------------------------------------------- input

  private bindInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as ArenaScene['keys'];
    const queue: [string[], number][] = [[['DOWN', 'S'], 0], [['LEFT', 'A'], 1], [['RIGHT', 'D'], 2], [['UP', 'W'], 3]];
    for (const [names, dir] of queue) for (const n of names) kb.on(`keydown-${n}`, () => (this.queuedDir = dir));
    kb.on('keydown-SPACE', () => this.attack());
    kb.on('keydown-E', () => this.special());
    kb.on('keydown-SHIFT', () => this.special());
    kb.on('keydown-ESC', () => this.leave());
  }

  private me(): Body | undefined {
    return this.bodies.get(this.selfId);
  }

  private canAct(b: Body | undefined): b is Body {
    return !!b && !b.view.ko && (this.session?.serverNow() ?? 0) >= b.view.stunUntil;
  }

  private attack(): void {
    const b = this.me();
    if (!this.canAct(b) || !this.session) return;
    const now = performance.now();
    if (now < this.attackReadyAt) return;
    this.attackReadyAt = now + fighterFor(b.view.cls).attack.cooldown;
    this.session.attack(b.view.dir);
    this.lunge(this.selfId, b.view.dir);
  }

  private special(): void {
    const b = this.me();
    if (!this.canAct(b) || !this.session || this.session.serverNow() < b.view.specialReadyAt) return;
    this.session.special(b.view.dir);
  }

  private heldDir(): number | null {
    const k = this.keys;
    if (k.down.isDown || k.s.isDown) return 0;
    if (k.left.isDown || k.a.isDown) return 1;
    if (k.right.isDown || k.d.isDown) return 2;
    if (k.up.isDown || k.w.isDown) return 3;
    return this.queuedDir;
  }

  private free(x: number, y: number): boolean {
    if (!arenaWalkable(x, y)) return false;
    for (const [id, b] of this.bodies) if (id !== this.selfId && !b.view.ko && b.x === x && b.y === y) return false;
    return true;
  }

  update(): void {
    this.refreshHud();
    const b = this.me();
    const dir = this.heldDir();
    this.queuedDir = null;
    if (this.moving || dir === null || !this.canAct(b)) return;
    if (dir !== b.view.dir) {
      b.view = { ...b.view, dir };
      b.sprite.setTexture(TEX.hero(b.view, dir, 0));
    }
    const [dx, dy] = DIRS[dir];
    const nx = b.x + dx, ny = b.y + dy;
    if (!this.free(nx, ny)) {
      this.session?.face(dir);
      return;
    }
    this.moving = true;
    this.lastLocalMove = performance.now();
    this.session?.move(dir);
    this.moveBody(b, nx, ny, dir, false);
    this.time.delayedCall(STEP_MS, () => {
      this.moving = false;
      this.lastLocalMove = performance.now();
    });
  }

  private lastHud = 0;

  private refreshHud(): void {
    const now = performance.now();
    if (now - this.lastHud < 100) return;
    this.lastHud = now;
    const b = this.me();
    const s = this.session;
    if (!b || !s) return;
    const f = fighterFor(b.view.cls);
    const atk = Math.max(0, (this.attackReadyAt - now) / f.attack.cooldown);
    const spLeft = Math.max(0, b.view.specialReadyAt - s.serverNow());
    this.hud.setBars(b.view, atk, Math.min(1, spLeft / f.special.cooldown), Math.ceil(spLeft / 1000));
    if (this.koBy !== null) this.hud.setKo(this.koBy, Math.max(0, Math.ceil((b.view.respawnAt - s.serverNow()) / 1000)));
    // status effects
    for (const body of this.bodies.values()) {
      body.shield.setVisible(!body.view.ko && s.serverNow() < body.view.shieldUntil);
      body.stun.setVisible(!body.view.ko && s.serverNow() < body.view.stunUntil);
    }
  }

  // ------------------------------------------------------------- leaving

  leave(reason?: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.session?.leave();
    this.session = null;
    this.hud.hide();
    this.cfg.onExit(reason);
  }
}
