import { CLASSES, heroFrame, type HeroLook } from '../gfx/characters';
import type { SelfStats } from '../net/council';
import type { Region } from '../world/types';
import { HYP, levelProgress, LEVELS, SKILLS, XP } from '../../../shared/rules';

const $ = (id: string) => document.getElementById(id)!;

export interface RosterEntry extends HeroLook {
  id: string;
  name: string;
  self: boolean;
  regionName?: string;
  reading?: string;
  level?: number;
}

/** DOM HUD: region banner, hint, party roster, toasts, help + audit panels, minimap frame. */
export class Hud {
  private region = $('region');
  private hint = $('hint');
  private help = $('help');
  private audit = $('audit');
  private frame = $('minimap-frame');
  private roster = $('roster');
  private toasts = $('toasts');
  private portraits = new Map<string, string>();
  private sheet = $('sheet');
  private sheetData: { name: string; look: HeroLook; stats: SelfStats | null; online: boolean } | null = null;

  private mock: boolean;

  constructor(opts: { mock: boolean }) {
    this.mock = opts.mock;
    this.setOnline(true);
    $('help-btn').addEventListener('click', () => this.toggleHelp());
    $('sheet-btn').addEventListener('click', () => this.toggleSheet());
  }

  setOnline(online: boolean): void {
    const badges: string[] = [];
    if (this.mock) badges.push('mock data');
    if (!online) badges.push('offline · solo');
    const badge = $('badge');
    badge.textContent = badges.join(' · ');
    badge.title = online ? '' : 'No game server reachable, so you are exploring alone. Start one with: npm --prefix server run dev';
    badge.classList.toggle('hidden', badges.length === 0);
  }

  setRegion(r: Region | undefined): void {
    this.region.replaceChildren(r?.name ?? 'The open sea');
    if (r?.scaffold_smiles) {
      const s = document.createElement('small');
      s.textContent = `scaffold ${r.scaffold_smiles}`;
      this.region.append(s);
    }
  }

  setHint(compoundId: string | null): void {
    if (!compoundId) {
      this.hint.classList.add('hidden');
      return;
    }
    this.hint.innerHTML = `<kbd>Space</kbd> study crystal <b></b>`;
    this.hint.querySelector('b')!.textContent = compoundId;
    this.hint.classList.remove('hidden');
  }

  private portrait(look: HeroLook): string {
    const key = `${look.cls}-${look.tunic}-${look.skin}-${look.hair}`;
    let url = this.portraits.get(key);
    if (!url) {
      const src = heroFrame(look, 0, 0);
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 14;
      c.getContext('2d')!.drawImage(src, 0, 0, 16, 14, 0, 0, 16, 14);
      url = c.toDataURL();
      this.portraits.set(key, url);
    }
    return url;
  }

  setRoster(entries: RosterEntry[]): void {
    const head = document.createElement('h3');
    head.textContent = entries.length > 1 ? `Party · ${entries.length} adventurers` : 'Party · just you';
    const list = document.createElement('ul');
    for (const e of [...entries].sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name))) {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = this.portrait(e);
      img.alt = '';
      const cls = CLASSES.find((c) => c.id === e.cls);
      const text = document.createElement('div');
      const nm = document.createElement('b');
      nm.textContent = e.self ? `${e.name} (you)` : e.name;
      const sub = document.createElement('small');
      sub.textContent = `${e.level ? `Lv ${e.level} ` : ''}${cls?.title ?? e.cls} · ${cls?.role ?? ''}`;
      const where = document.createElement('small');
      where.className = 'where';
      where.textContent = e.reading === 'arena' ? '⚔ in the arena' : e.reading ? `📜 studying ${e.reading}` : e.regionName ?? '';
      text.append(nm, sub, where);
      li.append(img, text);
      list.append(li);
    }
    this.roster.replaceChildren(head, list);
    this.roster.classList.remove('hidden');
  }

  /** Own level + XP bar (top-left, under the region banner) and the character sheet. */
  setSelf(name: string, look: HeroLook, stats: SelfStats | null, online: boolean): void {
    this.sheetData = { name, look, stats, online };
    const box = $('xpbar');
    if (!stats) {
      box.classList.add('hidden');
    } else {
      const { level, into, span } = levelProgress(stats.xp);
      const max = level >= LEVELS.length;
      box.innerHTML = '<b></b><span class="track"><i></i></span><small></small>';
      box.querySelector('b')!.textContent = `Lv ${level}`;
      (box.querySelector('i') as HTMLElement).style.width = `${Math.round((into / span) * 100)}%`;
      box.querySelector('small')!.textContent = max ? `${stats.xp} XP · max level` : `${into} / ${span} XP`;
      box.classList.remove('hidden');
    }
    if (!this.sheet.classList.contains('hidden')) this.renderSheet();
  }

  toggleSheet(): void {
    document.getElementById('quests')!.classList.add('hidden');
    this.help.classList.add('hidden');
    this.audit.classList.add('hidden');
    this.sheet.classList.toggle('hidden');
    if (!this.sheet.classList.contains('hidden')) this.renderSheet();
  }

  private renderSheet(): void {
    const d = this.sheetData;
    if (!d) return;
    const cls = CLASSES.find((c) => c.id === d.look.cls);
    const s = d.stats;
    const level = s ? levelProgress(s.xp).level : 1;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const head = el('div', 'sheet-head');
    const img = el('img');
    img.src = this.portrait(d.look);
    img.alt = '';
    const who = el('div');
    who.append(el('h3', undefined, d.name), el('div', undefined, `${cls?.title} · ${cls?.role}`), el('div', 'muted', s ? `Level ${level} · ${s.xp} XP` : 'Level 1'));
    head.append(img, who);

    const calib = el('p');
    if (!d.online) calib.textContent = 'Progress is kept by the realm server. You are exploring solo, so nothing is recorded right now.';
    else if (!s || s.calls === 0) calib.textContent = 'No resolved calls yet. Vote on grey crystals; XP arrives when their results do.';
    else calib.textContent = `Calibration: ${s.correct} of ${s.calls} resolved calls correct (${Math.round((100 * s.correct) / s.calls)}%).`;
    const hyps = el('p');
    hyps.textContent = s ? `Hypotheses authored: ${s.supported} supported, ${s.refuted} refuted.` : '';

    const list = el('ul', 'skills');
    for (const sk of SKILLS.filter((k) => k.cls === d.look.cls)) {
      const li = el('li', level >= sk.level ? 'unlocked' : 'locked');
      li.append(el('b', undefined, `${level >= sk.level ? '✦' : '🔒'} ${sk.name}`), el('small', undefined, ` (level ${sk.level})`), el('div', undefined, sk.text));
      list.append(li);
    }
    const rules = el('p', 'muted', `XP comes only from resolved outcomes. Crystal calls: a correct ⚒ on a hit earns ${XP.hitCalled}, a correct ✋ on a miss ${XP.missCalled}, a wrong call ${XP.learned}. Hypotheses: author ${HYP.supported} if supported, ${HYP.refuted} if refuted; a right believe/doubt stance ${HYP.stanceRight}. Skills give information or speed, never extra votes.`);
    this.sheet.replaceChildren(head, calib, hyps, el('h3', undefined, 'Skills'), list, rules);
  }

  toast(msg: string, kind: '' | 'xp' | 'level' = ''): void {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    this.toasts.append(t);
    setTimeout(() => t.classList.add('fade'), 3200);
    setTimeout(() => t.remove(), 4000);
  }

  toggleHelp(): void {
    document.getElementById('quests')!.classList.add('hidden');
    this.audit.classList.add('hidden');
    this.sheet.classList.add('hidden');
    this.help.classList.toggle('hidden');
  }

  setAudit(on: boolean): void {
    if (on) {
      this.help.classList.add('hidden');
      this.sheet.classList.add('hidden');
    }
    this.audit.classList.toggle('hidden', !on);
  }

  placeMinimap(x: number, y: number, w: number, h: number): void {
    Object.assign(this.frame.style, { left: `${x - 3}px`, top: `${y - 3}px`, width: `${w + 6}px`, height: `${h + 6}px` });
    this.frame.classList.remove('hidden');
  }
}
