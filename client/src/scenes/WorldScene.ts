import Phaser from 'phaser';
import { measured, potencyColour, UNTESTED } from '../gfx/activity';
import { CLASSES, type HeroLook } from '../gfx/characters';
import {
  ensureHeroTextures, generateTextures, GROUND_DECOR, TEX, TERRAIN_VARIANTS, TILE, WATER_FRAMES, type Side,
} from '../gfx/textures';
import type { NetEvents, NetPlayer, Profile, Session } from '../net/session';
import { buildAuditLayer, renderMetrics } from '../ui/audit';
import { CompoundCard } from '../ui/card';
import { Hud, type RosterEntry } from '../ui/hud';
import { buildBlocked, isPassable, tileKey } from '../world/collision';
import { OVERLAY_BRIDGE, OVERLAY_PATH, WATER, type Compound, type LoadedWorld, type Region, type WorldData } from '../world/types';

const ZOOM = 3;
const STEP_MS = 150;
const LABEL_RANGE = 3; // tiles
const MINIMAP_PX = 4; // screen pixels per tile
const DIRS: [dx: number, dy: number][] = [[0, 1], [-1, 0], [1, 0], [0, -1]]; // down left right up
const SIDES: [Side, number, number][] = [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]];

const centre = (t: number) => t * TILE + TILE / 2;
/** Characters stand on the bottom of their tile. */
const feet = (t: number) => (t + 1) * TILE - 2;
/** Painter's order: things lower on screen draw on top. */
const ySort = (bottomPx: number) => 100 + bottomPx;
const UI_DEPTH = 100000;

interface Avatar {
  look: HeroLook;
  name: string;
  sprite: Phaser.GameObjects.Sprite;
  tag?: Phaser.GameObjects.Text;
  scroll?: Phaser.GameObjects.Image;
  marker: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  dir: number;
  frame: number;
  reading: string;
}

export class WorldScene extends Phaser.Scene {
  private world: WorldData;
  private W = 0;
  private H = 0;
  private regionByIndex = new Map<number, Region>();
  private blocked: Set<string>;
  private compoundAt = new Map<string, Compound>();
  private labels: { c: Compound; text: Phaser.GameObjects.Text }[] = [];
  private me!: Avatar;
  private others = new Map<string, Avatar>();
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private audit!: Phaser.GameObjects.Graphics;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private moving = false;
  private queuedDir: number | null = null; // a tap between frames still counts as a step
  private card: CompoundCard;
  private hud: Hud;
  private session: Session | null = null;
  private pendingNet: (() => void)[] = []; // net events that arrive before create()

  constructor(loaded: LoadedWorld, private profile: Profile) {
    super('world');
    this.world = loaded.data;
    this.blocked = buildBlocked(this.world);
    this.hud = new Hud({ mock: loaded.isMock });
    this.card = new CompoundCard(this.world, {
      opened: (c) => this.session?.reading(c.id),
      closed: () => this.session?.reading(null),
    });
  }

  /** Network callbacks; safe to wire before the scene has been created. */
  netEvents(): NetEvents {
    const later = (fn: () => void) => (this.me ? fn() : this.pendingNet.push(fn));
    return {
      add: (p, self) => later(() => (self ? this.syncSelf(p, true) : this.addOther(p))),
      change: (p, self) => later(() => (self ? this.syncSelf(p, false) : this.updateOther(p))),
      remove: (id) => later(() => this.removeOther(id)),
      reject: (x, y, dir) => later(() => this.snapSelf(x, y, dir)),
      disconnected: () => later(() => {
        this.session = null;
        this.hud.setOnline(false);
        for (const id of [...this.others.keys()]) this.removeOther(id);
        this.hud.toast('Lost connection to the realm, now exploring solo.');
      }),
    };
  }

  attachSession(s: Session | null): void {
    this.session = s;
    this.hud.setOnline(!!s);
  }

  create(): void {
    generateTextures(this);
    [this.W, this.H] = this.world.meta.grid;
    for (const r of this.world.regions) this.regionByIndex.set(r.index, r);

    this.buildTerrain();
    this.buildDecor();
    this.buildCompounds();
    this.spawnSelf();
    this.audit = buildAuditLayer(this, this.world).setDepth(UI_DEPTH - 10);
    renderMetrics(this.world);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.W * TILE, this.H * TILE).setZoom(ZOOM).setRoundPixels(true);
    cam.startFollow(this.me.sprite, true, 1, 1, 0, -6);
    this.buildMinimap();

    this.bindInput();
    this.scale.on('resize', () => this.placeMinimap());
    this.afterStep();
    for (const fn of this.pendingNet.splice(0)) fn();
    this.refreshRoster();
  }

  // ------------------------------------------------------------- world

  private terrainAt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.W || y >= this.H ? WATER : this.world.tiles[y][x];
  }

  private overlayAt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.W || y >= this.H ? 0 : this.world.overlay![y][x];
  }

  /**
   * Bakes all ground layers (terrain, water, foam, roads, bridges, ledges) into
   * one canvas per water-animation frame. One image instead of thousands of
   * tiles: faster, and no seams between tiles at fractional camera positions.
   */
  private buildTerrain(): void {
    const draw = (ctx: CanvasRenderingContext2D, key: string, x: number, y: number) =>
      ctx.drawImage(this.textures.get(key).getSourceImage() as CanvasImageSource, x * TILE, y * TILE);
    const frames: string[] = [];
    for (let f = 0; f < WATER_FRAMES; f++) {
      const c = document.createElement('canvas');
      c.width = this.W * TILE;
      c.height = this.H * TILE;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < this.H; y++) {
        for (let x = 0; x < this.W; x++) {
          const v = this.world.tiles[y][x];
          const ov = this.overlayAt(x, y);
          const variant = (((x * 73856093) ^ (y * 19349663)) >>> 0) % TERRAIN_VARIANTS;
          if (v === WATER || ov === OVERLAY_BRIDGE) {
            draw(ctx, TEX.water((x + y + f) % WATER_FRAMES), x, y);
            for (const [side, dx, dy] of SIDES) {
              if (this.terrainAt(x + dx, y + dy) !== WATER && this.overlayAt(x + dx, y + dy) !== OVERLAY_BRIDGE) draw(ctx, TEX.foam(side), x, y);
            }
            if (ov === OVERLAY_BRIDGE) {
              const horiz = this.isWalkway(x - 1, y) || this.isWalkway(x + 1, y);
              const vert = this.isWalkway(x, y - 1) || this.isWalkway(x, y + 1);
              draw(ctx, TEX.bridge(horiz && !vert), x, y);
            }
            continue;
          }
          draw(ctx, TEX.terrain(this.regionByIndex.get(v)?.terrain ?? 'grass', variant), x, y);
          if (ov === OVERLAY_PATH) {
            draw(ctx, TEX.path(variant), x, y);
            for (const [side, dx, dy] of SIDES) if (!this.isWalkway(x + dx, y + dy)) draw(ctx, TEX.pathEdge(side), x, y);
          }
          if (this.terrainAt(x, y + 1) === WATER && this.overlayAt(x, y + 1) !== OVERLAY_BRIDGE) draw(ctx, TEX.cliff, x, y);
        }
      }
      const key = `ground_${f}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, c);
      frames.push(key);
    }
    const ground = this.add.image(0, 0, frames[0]).setOrigin(0).setDepth(0);
    let frame = 0;
    this.time.addEvent({ delay: 450, loop: true, callback: () => ground.setTexture(frames[(frame = (frame + 1) % frames.length)]) });
  }

  private isWalkway(x: number, y: number): boolean {
    const o = this.overlayAt(x, y);
    return o === OVERLAY_PATH || o === OVERLAY_BRIDGE;
  }

  private buildDecor(): void {
    for (const d of this.world.decor ?? []) {
      if (!this.textures.exists(TEX.decor(d.kind))) continue;
      const img = this.add.image(centre(d.x), (d.y + 1) * TILE, TEX.decor(d.kind)).setOrigin(0.5, 1);
      img.setDepth(GROUND_DECOR.has(d.kind) ? 3 : ySort((d.y + 1) * TILE - 1));
      if (d.kind === 'tree' || d.kind === 'pine' || d.kind === 'palm') {
        // gentle sway so the forest feels alive
        this.tweens.add({ targets: img, angle: { from: -0.8, to: 0.8 }, duration: 1800 + ((d.x * 31 + d.y * 17) % 900), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
  }

  /** Tested crystals glow in their potency colour; untested ones stay dull and unlit. */
  private buildCompounds(): void {
    for (const c of this.world.compounds) {
      this.compoundAt.set(tileKey(c.tile_x, c.tile_y), c);
      const p = measured(c);
      const bottom = (c.tile_y + 1) * TILE;
      const delay = (c.tile_x * 7 + c.tile_y * 13) % 900;
      this.add.image(centre(c.tile_x), bottom, TEX.pedestal).setOrigin(0.5, 1).setDepth(ySort(bottom - 1));
      const s = this.add
        .image(centre(c.tile_x), c.tile_y * TILE + 9, TEX.crystal)
        .setOrigin(0.5, 1)
        .setTint(p === null ? UNTESTED : potencyColour(p))
        .setDepth(ySort(bottom))
        .setInteractive({ useHandCursor: true });
      s.on('pointerdown', () => this.openCard(c));
      if (p !== null) {
        // brighter, larger halo for more potent compounds
        const strength = Phaser.Math.Clamp((p - 4.5) / 4, 0.15, 1);
        const glow = this.add.circle(centre(c.tile_x), c.tile_y * TILE + 3, 5 + 4 * strength, potencyColour(p), 0.2).setDepth(ySort(bottom) - 0.5);
        this.tweens.add({ targets: s, y: s.y - 2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay });
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.12 + 0.3 * strength }, scale: { from: 0.9, to: 1.15 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay });
      } else {
        s.setAlpha(0.8);
        const q = this.add
          .text(centre(c.tile_x) + 6, c.tile_y * TILE - 1, '?', { fontFamily: '"Pixelify Sans", monospace', fontSize: '7px', color: '#e8ecf2', stroke: '#2a2f3a', strokeThickness: 2, resolution: 8 })
          .setOrigin(0.5, 1)
          .setDepth(ySort(bottom) + 0.5);
        this.tweens.add({ targets: q, alpha: { from: 0.35, to: 0.9 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay });
      }
      const text = this.add
        .text(centre(c.tile_x), c.tile_y * TILE - 5, p === null ? `${c.id} · ?` : `${c.id} · ${p.toFixed(1)}`, {
          fontFamily: '"Pixelify Sans", ui-monospace, monospace',
          fontSize: '7px',
          color: p === null ? '#d4d8e0' : '#fff6d8',
          stroke: '#2a1a0a',
          strokeThickness: 2,
          resolution: 8,
        })
        .setOrigin(0.5, 1)
        .setDepth(UI_DEPTH)
        .setVisible(false);
      this.labels.push({ c, text });
    }
  }

  // ------------------------------------------------------------- avatars

  private makeAvatar(look: HeroLook, name: string, x: number, y: number, dir: number, withTag: boolean, markerColour: number): Avatar {
    ensureHeroTextures(this, look);
    const sprite = this.add.sprite(centre(x), feet(y), TEX.hero(look, dir, 0)).setOrigin(0.5, 1).setDepth(ySort(feet(y) + 1));
    const a: Avatar = { look, name, sprite, x, y, dir, frame: 0, reading: '', marker: this.add.circle(centre(x), centre(y), 14, markerColour).setStrokeStyle(6, 0xffffff).setDepth(UI_DEPTH) };
    if (withTag) {
      a.tag = this.add
        .text(centre(x), feet(y) - 24, name, {
          fontFamily: '"Pixelify Sans", ui-sans-serif, sans-serif',
          fontSize: '6px',
          color: '#ffffff',
          stroke: '#1a1020',
          strokeThickness: 2,
          resolution: 8,
        })
        .setOrigin(0.5, 1)
        .setDepth(UI_DEPTH);
      a.scroll = this.add.image(centre(x) + 9, feet(y) - 22, TEX.scroll).setOrigin(0.5, 1).setDepth(UI_DEPTH).setVisible(false);
      this.tweens.add({ targets: a.scroll, y: '-=2', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.cameras.main.ignore(a.marker);
    if (this.minimap) this.minimap.ignore([a.sprite, ...(a.tag ? [a.tag] : []), ...(a.scroll ? [a.scroll] : [])]);
    return a;
  }

  private placeAvatar(a: Avatar, px: number, py: number): void {
    a.sprite.setPosition(px, py).setDepth(ySort(py + 1));
    a.tag?.setPosition(px, py - 24);
    a.scroll?.setPosition(px + 9, py - 22);
    a.marker.setPosition(px, py - TILE / 2 + 2);
  }

  private spawnSelf(): void {
    const spawns = this.world.spawns ?? [];
    let [x, y] = spawns.length ? spawns[Math.floor(Math.random() * Math.min(spawns.length, 4))] : [-1, -1];
    if (!isPassable(this.world, this.blocked, x, y)) [x, y] = this.fallbackSpawn();
    this.me = this.makeAvatar(this.profile, this.profile.name, x, y, 0, false, 0xff3b3b);
  }

  private fallbackSpawn(): [number, number] {
    const first = this.world.compounds[0];
    let best: [number, number] = [first.tile_x, first.tile_y + 1];
    let bestD = Infinity;
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const d = Math.abs(x - first.tile_x) + Math.abs(y - first.tile_y);
        if (d >= 2 && d < bestD && isPassable(this.world, this.blocked, x, y)) [best, bestD] = [[x, y], d];
      }
    }
    return best;
  }

  /** The server owns our spawn position; on join (and only then) we jump to it. */
  private syncSelf(p: NetPlayer, joined: boolean): void {
    if (joined) this.snapSelf(p.x, p.y, p.dir);
  }

  private snapSelf(x: number, y: number, dir: number): void {
    this.tweens.killTweensOf(this.me.sprite);
    this.moving = false;
    Object.assign(this.me, { x, y, dir });
    this.me.sprite.setTexture(TEX.hero(this.me.look, dir, 0));
    this.placeAvatar(this.me, centre(x), feet(y));
    this.afterStep();
  }

  private addOther(p: NetPlayer): void {
    if (this.others.has(p.id)) return;
    const a = this.makeAvatar(p, p.name, p.x, p.y, p.dir, true, 0xffffff);
    a.reading = p.reading;
    a.scroll?.setVisible(!!p.reading);
    this.others.set(p.id, a);
    const cls = CLASSES.find((c) => c.id === p.cls);
    this.hud.toast(`${p.name} the ${cls?.title ?? 'Adventurer'} (${cls?.role ?? ''}) joined`);
    this.refreshRoster();
  }

  private updateOther(p: NetPlayer): void {
    const a = this.others.get(p.id);
    if (!a) return this.addOther(p);
    if (a.reading !== p.reading) {
      a.reading = p.reading;
      a.scroll?.setVisible(!!p.reading);
      this.refreshRoster();
    }
    if (p.x !== a.x || p.y !== a.y) {
      const far = Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 1;
      a.x = p.x;
      a.y = p.y;
      a.dir = p.dir;
      a.frame = a.frame === 1 ? 2 : 1;
      a.sprite.setTexture(TEX.hero(a.look, a.dir, a.frame));
      this.tweens.killTweensOf(a.sprite);
      const from = { x: a.sprite.x, y: a.sprite.y };
      const to = { x: centre(p.x), y: feet(p.y) };
      if (far) {
        this.placeAvatar(a, to.x, to.y);
      } else {
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: STEP_MS,
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 1;
            this.placeAvatar(a, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
          },
          onComplete: () => a.sprite.setTexture(TEX.hero(a.look, a.dir, 0)),
        });
      }
      this.refreshRoster();
    } else if (p.dir !== a.dir) {
      a.dir = p.dir;
      a.sprite.setTexture(TEX.hero(a.look, a.dir, 0));
    }
  }

  private removeOther(id: string): void {
    const a = this.others.get(id);
    if (!a) return;
    a.sprite.destroy();
    a.tag?.destroy();
    a.scroll?.destroy();
    a.marker.destroy();
    this.others.delete(id);
    this.hud.toast(`${a.name} left the realm`);
    this.refreshRoster();
  }

  private refreshRoster(): void {
    const regionName = (x: number, y: number) => this.regionByIndex.get(this.terrainAt(x, y))?.name;
    const entries: RosterEntry[] = [
      { ...this.profile, id: 'self', self: true, regionName: regionName(this.me.x, this.me.y) },
      ...[...this.others.entries()].map(([id, a]) => ({
        ...a.look, id, name: a.name, self: false, regionName: regionName(a.x, a.y), reading: a.reading,
      })),
    ];
    this.hud.setRoster(entries);
  }

  // ------------------------------------------------------------- minimap

  private buildMinimap(): void {
    this.minimap = this.cameras
      .add(0, 0, this.W * MINIMAP_PX, this.H * MINIMAP_PX)
      .setZoom(MINIMAP_PX / TILE)
      .setBackgroundColor(0x0d1424)
      .setName('minimap');
    this.minimap.centerOn((this.W * TILE) / 2, (this.H * TILE) / 2);
    this.minimap.ignore([this.me.sprite, ...this.labels.map((l) => l.text), this.audit]);
    this.placeMinimap();
  }

  private placeMinimap(): void {
    const w = this.W * MINIMAP_PX;
    const h = this.H * MINIMAP_PX;
    const x = this.scale.width - w - 16;
    const y = this.scale.height - h - 16;
    this.minimap.setPosition(x, y);
    this.hud.placeMinimap(x, y, w, h);
  }

  // ------------------------------------------------------------- input / movement

  private bindInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as WorldScene['keys'];
    const queue: [string[], number][] = [[['DOWN', 'S'], 0], [['LEFT', 'A'], 1], [['RIGHT', 'D'], 2], [['UP', 'W'], 3]];
    for (const [names, dir] of queue) for (const n of names) kb.on(`keydown-${n}`, () => (this.queuedDir = dir));
    const interact = () => {
      if (this.card.isOpen) this.card.close();
      else this.interact();
    };
    kb.on('keydown-SPACE', interact);
    kb.on('keydown-ENTER', interact);
    kb.on('keydown-ESC', () => this.card.close());
    kb.on('keydown-T', () => this.toggleAudit());
    kb.on('keydown-H', () => this.hud.toggleHelp());
  }

  private heldDir(): number | null {
    const k = this.keys;
    if (k.down.isDown || k.s.isDown) return 0;
    if (k.left.isDown || k.a.isDown) return 1;
    if (k.right.isDown || k.d.isDown) return 2;
    if (k.up.isDown || k.w.isDown) return 3;
    return this.queuedDir;
  }

  update(): void {
    if (this.card.isOpen) this.queuedDir = null;
    if (this.moving || this.card.isOpen) return;
    const dir = this.heldDir();
    this.queuedDir = null;
    if (dir === null) return;
    const me = this.me;
    const turned = dir !== me.dir;
    if (turned) {
      me.dir = dir;
      me.sprite.setTexture(TEX.hero(me.look, dir, 0));
      this.afterStep();
    }
    const [dx, dy] = DIRS[dir];
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (!isPassable(this.world, this.blocked, nx, ny)) {
      if (turned) this.session?.face(dir);
      return;
    }
    this.moving = true;
    me.frame = me.frame === 1 ? 2 : 1;
    me.sprite.setTexture(TEX.hero(me.look, dir, me.frame));
    this.session?.move(dir); // predicted locally; the server may reject
    const from = { x: me.sprite.x, y: me.sprite.y };
    const to = { x: centre(nx), y: feet(ny) };
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: STEP_MS,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 1;
        this.placeAvatar(me, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      },
      onComplete: () => {
        me.x = nx;
        me.y = ny;
        this.moving = false;
        if (this.heldDir() === null) me.sprite.setTexture(TEX.hero(me.look, me.dir, 0));
        this.afterStep();
      },
    });
  }

  private facing(): Compound | undefined {
    const [dx, dy] = DIRS[this.me.dir];
    return this.compoundAt.get(tileKey(this.me.x + dx, this.me.y + dy));
  }

  private lastRegion = -2;

  private afterStep(): void {
    const { x, y } = this.me;
    for (const { c, text } of this.labels) {
      text.setVisible(Math.max(Math.abs(c.tile_x - x), Math.abs(c.tile_y - y)) <= LABEL_RANGE || this.audit.visible);
    }
    const r = this.terrainAt(x, y);
    this.hud.setRegion(this.regionByIndex.get(r));
    this.hud.setHint(this.facing()?.id ?? null);
    if (r !== this.lastRegion) {
      this.lastRegion = r;
      this.refreshRoster();
    }
  }

  private interact(): void {
    const c = this.facing();
    if (c) this.openCard(c);
  }

  private openCard(c: Compound): void {
    this.hud.setHint(null);
    this.card.open(c);
  }

  private toggleAudit(): void {
    this.audit.setVisible(!this.audit.visible);
    this.hud.setAudit(this.audit.visible);
    this.afterStep();
  }
}
