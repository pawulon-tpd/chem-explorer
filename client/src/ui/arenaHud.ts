import { CLASSES } from '../gfx/characters';
import type { FighterView } from '../net/arenaSession';
import { fighterFor } from '../../../shared/arena';

const $ = (id: string) => document.getElementById(id)!;

/** DOM overlay for the arena: HP, cooldowns, scoreboard, combat feed, KO countdown. */
export class ArenaHud {
  private root = $('arena-hud');
  private bars = $('arena-bars');
  private board = $('arena-board');
  private feed = $('arena-feed');
  private koBox = $('arena-ko');
  private hint = $('arena-hint');

  constructor(onLeave: () => void) {
    $('arena-leave').onclick = onLeave;
  }

  show(cls: string): void {
    const f = fighterFor(cls);
    this.hint.innerHTML = '';
    const parts: [string, string][] = [
      ['Space', f.attack.name],
      ['E', `${f.special.name}: ${f.special.text}`],
      ['Esc', 'leave (or walk into the blue portal)'],
    ];
    for (const [k, text] of parts) {
      const span = document.createElement('span');
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      span.append(kbd, ` ${text}`);
      this.hint.append(span);
    }
    this.feed.replaceChildren();
    this.koBox.classList.add('hidden');
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** hp + cooldown fractions (0 = ready). */
  setBars(me: FighterView | null, attackCd: number, specialCd: number, specialLeftS: number): void {
    if (!me) {
      this.bars.textContent = 'Entering the arena…';
      return;
    }
    const f = fighterFor(me.cls);
    const hpPct = Math.max(0, Math.round((me.hp / me.maxHp) * 100));
    this.bars.innerHTML = `
      <div class="abar hp"><span>HP</span><i><b style="width:${hpPct}%"></b></i><small>${me.hp}/${me.maxHp}</small></div>
      <div class="abar cd"><span>⚔</span><i><b style="width:${Math.round((1 - attackCd) * 100)}%"></b></i><small></small></div>
      <div class="abar sp"><span>✦</span><i><b style="width:${Math.round((1 - specialCd) * 100)}%"></b></i><small></small></div>`;
    this.bars.querySelectorAll('small')[1].textContent = f.attack.name;
    this.bars.querySelectorAll('small')[2].textContent = specialLeftS > 0 ? `${f.special.name} ${specialLeftS}s` : `${f.special.name} ready`;
  }

  setBoard(fighters: FighterView[], selfId: string): void {
    const head = document.createElement('h3');
    head.textContent = `Glory · ${fighters.length} in the arena`;
    const list = document.createElement('ol');
    for (const f of [...fighters].sort((a, b) => b.kos - a.kos || a.falls - b.falls)) {
      const li = document.createElement('li');
      if (f.id === selfId) li.className = 'me';
      const cls = CLASSES.find((c) => c.id === f.cls)?.title ?? f.cls;
      const name = document.createElement('b');
      name.textContent = f.id === selfId ? `${f.name} (you)` : f.name;
      li.append(name, ` ${cls} · ${f.kos} KO · ${f.falls} falls${f.ko ? ' · 💫' : ''}`);
      list.append(li);
    }
    const note = document.createElement('small');
    note.textContent = 'Arena glory lasts this visit and never touches XP.';
    this.board.replaceChildren(head, list, note);
  }

  log(text: string, mine = false): void {
    const d = document.createElement('div');
    d.className = mine ? 'mine' : '';
    d.textContent = text;
    this.feed.prepend(d);
    while (this.feed.children.length > 5) this.feed.lastChild!.remove();
    setTimeout(() => d.classList.add('fade'), 5000);
  }

  setKo(by: string | null, secondsLeft: number): void {
    if (by === null) {
      this.koBox.classList.add('hidden');
      return;
    }
    this.koBox.textContent = `Knocked out by ${by}. Back in ${secondsLeft}…`;
    this.koBox.classList.remove('hidden');
  }
}
