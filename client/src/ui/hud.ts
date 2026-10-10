import { CLASSES, heroFrame, type HeroLook } from '../gfx/characters';
import type { Region } from '../world/types';

const $ = (id: string) => document.getElementById(id)!;

export interface RosterEntry extends HeroLook {
  id: string;
  name: string;
  self: boolean;
  regionName?: string;
  reading?: string;
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

  private mock: boolean;

  constructor(opts: { mock: boolean }) {
    this.mock = opts.mock;
    this.setOnline(true);
    $('help-btn').addEventListener('click', () => this.toggleHelp());
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
      sub.textContent = `${cls?.title ?? e.cls} · ${cls?.role ?? ''}`;
      const where = document.createElement('small');
      where.className = 'where';
      where.textContent = e.reading ? `📜 studying ${e.reading}` : e.regionName ?? '';
      text.append(nm, sub, where);
      li.append(img, text);
      list.append(li);
    }
    this.roster.replaceChildren(head, list);
    this.roster.classList.remove('hidden');
  }

  toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.toasts.append(t);
    setTimeout(() => t.classList.add('fade'), 3200);
    setTimeout(() => t.remove(), 4000);
  }

  toggleHelp(): void {
    this.audit.classList.add('hidden');
    this.help.classList.toggle('hidden');
  }

  setAudit(on: boolean): void {
    if (on) this.help.classList.add('hidden');
    this.audit.classList.toggle('hidden', !on);
  }

  placeMinimap(x: number, y: number, w: number, h: number): void {
    Object.assign(this.frame.style, { left: `${x - 3}px`, top: `${y - 3}px`, width: `${w + 6}px`, height: `${h + 6}px` });
    this.frame.classList.remove('hidden');
  }
}
