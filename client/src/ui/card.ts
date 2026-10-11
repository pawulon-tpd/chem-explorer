import { CLASSES } from '../gfx/characters';
import { potencyColour, potencyCss, UNTESTED } from '../gfx/activity';
import { shade } from '../gfx/paint';
import type { Council, CrystalView, Insight } from '../net/council';
import type { Compound, WorldData } from '../world/types';
import { HIT, quorum, sarEstimate, type Choice, type SkillId } from '../../../shared/rules';
import { simColourCss } from './audit';
import { depict } from './rdkit';

const PROPS: [key: string, label: string, digits: number][] = [
  ['MW', 'MW', 1],
  ['cLogP', 'cLogP', 2],
  ['TPSA', 'TPSA', 1],
  ['HBD', 'HBD', 0],
  ['HBA', 'HBA', 0],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** Darkened potency colour so it stays readable on parchment. */
const shadeCss = (c: number) => hex(shade(c, 0.6));

function ic50Text(p: number): string {
  const nm = Math.pow(10, 9 - p);
  const um = nm / 1000;
  return nm >= 1000 ? `${um >= 10 ? um.toFixed(0) : um.toFixed(1)} µM` : `${nm >= 10 ? Math.round(nm) : nm.toFixed(1)} nM`;
}

/** What the card needs from the multiplayer layer; council is null when playing solo. */
export interface CardCouncil {
  council(): Council | null;
  skills(): Set<SkillId>;
  online(): number;
  vote(id: string, choice: Choice | null): void;
  insight(id: string): Promise<Insight>;
  /** Measured or revealed pIC50, null when untested. */
  potency(c: Compound): number | null;
}

/** DOM overlay showing one compound. Clicking a neighbour navigates to it. */
export class CompoundCard {
  private root = document.getElementById('card')!;
  private byId: Map<string, Compound>;
  private current: Compound | null = null;
  private live: HTMLElement | null = null;
  private swatch: HTMLElement | null = null;
  private ticker = 0;
  private insights = new Map<string, Insight>(); // key: id|status
  private regionName: (c: Compound) => string;

  constructor(
    private world: WorldData,
    private link: CardCouncil,
    private hooks: { opened?: (c: Compound) => void; closed?: () => void } = {},
  ) {
    this.byId = new Map(world.compounds.map((c) => [c.id, c]));
    this.regionName = (c) => world.regions.find((r) => r.id === c.scaffold_id)?.name ?? c.scaffold_id;
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** Re-render the live parts when the council changes this crystal (or anything). */
  refresh(id: string | null): void {
    if (this.current && (id === null || id === this.current.id || this.isNeighbour(id))) this.renderLive();
  }

  private isNeighbour(id: string): boolean {
    return !!this.current && (this.world.similarity[this.current.id] ?? []).some(([n]) => n === id);
  }

  open(c: Compound): void {
    this.current = c;
    const region = this.world.regions.find((r) => r.id === c.scaffold_id);
    const card = el('div', 'card');

    const header = el('header');
    this.swatch = el('span', 'swatch');
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());
    header.append(this.swatch, el('span', 'id', c.id), el('span', 'name', c.name ?? ''), close);

    const structure = el('div', 'structure', 'Drawing structure…');
    const smiles = el('div', 'smiles', c.smiles);
    this.live = el('div', 'live');

    const props = el('section');
    props.append(el('h4', undefined, 'Properties'));
    const grid = el('div', 'props');
    for (const [key, label, digits] of PROPS) {
      const v = c.properties[key];
      const cell = el('div');
      cell.append(el('b', undefined, v === undefined ? '—' : v.toFixed(digits)), el('span', undefined, label));
      grid.append(cell);
    }
    props.append(grid);

    const meta = el('section', 'meta');
    const regionLine = el('div');
    regionLine.append('Land ', el('b', undefined, region?.name ?? c.scaffold_id));
    if (region?.scaffold_smiles) regionLine.append(` · scaffold ${region.scaffold_smiles}`);
    const tileLine = el('div', undefined, `Tile (${c.tile_x}, ${c.tile_y})`);
    if (c.displacement !== undefined) tileLine.append(` · moved ${c.displacement.toFixed(1)} tiles when snapped to the grid`);
    meta.append(regionLine, tileLine);

    card.append(header, structure, smiles, this.live, props, meta);
    this.root.replaceChildren(card);
    this.root.classList.remove('hidden');
    close.focus();
    this.renderLive();
    this.hooks.opened?.(c);

    window.clearInterval(this.ticker);
    this.ticker = window.setInterval(() => {
      const v = this.current && this.link.council()?.crystals.get(this.current.id);
      if (v && (v.status === 'synthesising' || v.status === 'assaying')) this.renderLive();
    }, 1000);

    depict(c, 460, 240)
      .then((svg) => {
        if (this.current === c) structure.innerHTML = svg;
      })
      .catch((e) => {
        if (this.current === c) structure.textContent = `Could not draw structure (${e.message ?? e})`;
      });
  }

  close(): void {
    if (this.current) this.hooks.closed?.();
    window.clearInterval(this.ticker);
    this.current = null;
    this.live = null;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  // ------------------------------------------------------------- live sections

  private renderLive(): void {
    const c = this.current;
    if (!c || !this.live) return;
    const council = this.link.council();
    const view = council?.crystals.get(c.id);
    const p = this.link.potency(c);
    this.swatch!.style.background = hex(p === null ? UNTESTED : potencyColour(p));
    this.live.replaceChildren(this.activitySection(c, p), this.councilSection(c, view, council), this.neighbourSection(c));
  }

  private activitySection(c: Compound, p: number | null): HTMLElement {
    const act = el('section', 'activity');
    act.append(el('h4', undefined, 'Activity'));
    const target = c.activity?.target;
    const row = el('div', 'act-row');
    if (p !== null) {
      const pill = el('span', 'pill', `pIC50 ${p.toFixed(1)}`);
      pill.style.background = potencyCss(p);
      row.append(pill, el('span', undefined, `IC50 ≈ ${ic50Text(p)}${target ? ` vs ${target}` : ''}${p >= HIT ? ' · a hit' : ''}`));
      act.append(row, el('div', 'note', 'Illustrative demo value, not a literature measurement.'));
    } else {
      row.append(el('span', 'pill untested', 'untested'), el('span', undefined, target ? `Not yet measured vs ${target}.` : 'No assay data.'));
      act.append(row, el('div', 'note', 'An unlit crystal: worth making and testing?'));
    }
    return act;
  }

  private councilSection(c: Compound, view: CrystalView | undefined, council: Council | null): HTMLElement {
    const sec = el('section', 'council');
    sec.append(el('h4', undefined, 'Synthesis council'));
    if (!council || !view) {
      sec.append(el('div', 'note', 'The council meets only when the realm server is running (you are exploring solo).'));
      return sec;
    }
    const known = c.activity?.pIC50 !== null && c.activity?.pIC50 !== undefined;
    if (view.status === 'tested' && known && view.votes.length === 0) {
      sec.append(el('div', 'note', 'Measured before the realm opened; nothing to decide here.'));
      return sec;
    }
    const mine = view.votes.find((v) => v.pid === council.self?.pid)?.choice ?? null;
    const { yes, no } = council.tally(view);

    if (view.status === 'untested') {
      const need = quorum(this.link.online());
      const status = el('div', 'council-status');
      status.append(
        el('span', 'tally yes', `⚒ ${yes}`),
        el('span', 'tally no', `✋ ${no}`),
        el('span', 'muted-ink', `approved at ${need} more ⚒ than ✋ (${this.link.online()} online)`),
      );
      const buttons = el('div', 'vote-buttons');
      for (const [choice, label] of [['for', '⚒ Synthesise'], ['against', '✋ Skip']] as [Choice, string][]) {
        const b = el('button', `vote ${choice}${mine === choice ? ' chosen' : ''}`, mine === choice ? `${label} ✓` : label);
        b.type = 'button';
        b.title = mine === choice ? 'Click again to withdraw your vote' : '';
        b.addEventListener('click', () => this.link.vote(c.id, mine === choice ? null : choice));
        buttons.append(b);
      }
      sec.append(status, buttons, el('div', 'note', `XP comes only when results arrive: a correct call earns 100 (hit) or 60 (miss), a wrong one 15.`));
    } else if (view.status === 'queued') {
      sec.append(el('div', 'council-status', `Approved. Waiting for a free synthesis slot in ${this.regionName(c)}.`));
    } else if (view.status === 'synthesising' || view.status === 'assaying') {
      const frac = council.progress(view);
      const left = Math.max(0, Math.ceil((view.readyAt - council.serverNow()) / 1000));
      const label = view.status === 'synthesising' ? '⚒ Synthesis in progress' : '⚗ Assay running';
      const bar = el('div', `progress ${view.status}`);
      const fill = el('i');
      fill.style.width = `${Math.round(frac * 100)}%`;
      bar.append(fill);
      sec.append(el('div', 'council-status', `${label} · ${left}s left`), bar);
    } else if (view.status === 'tested' && view.pIC50 !== null) {
      const hit = view.pIC50 >= HIT;
      sec.append(el('div', 'council-status', `Resolved: ${hit ? 'a hit' : 'not a hit'} (pIC50 ${view.pIC50.toFixed(1)}).`));
    }

    if (view.votes.length) {
      const list = el('ul', 'voters');
      for (const v of view.votes) {
        const cls = CLASSES.find((k) => k.id === v.cls);
        const li = el('li');
        let verdict = '';
        if (view.status === 'tested' && view.pIC50 !== null) verdict = (v.choice === 'for') === view.pIC50 >= HIT ? ' ✓' : ' ✗';
        li.append(
          el('span', `chip ${v.choice}`, v.choice === 'for' ? '⚒' : '✋'),
          el('b', undefined, v.pid === council.self?.pid ? `${v.name} (you)` : v.name),
          el('span', 'muted-ink', ` ${cls?.title ?? v.cls}${verdict}`),
        );
        list.append(li);
      }
      sec.append(list);
    }

    const skillBox = this.skillInsights(c, view);
    if (skillBox) sec.append(skillBox);
    return sec;
  }

  private skillInsights(c: Compound, view: CrystalView): HTMLElement | null {
    const skills = this.link.skills();
    const rows: HTMLElement[] = [];
    const untested = view.status !== 'tested';

    if (untested && skills.has('keen_eye')) {
      const nbs = (this.world.similarity[c.id] ?? []).map(([nid, sim]) => [sim, this.byId.get(nid) ? this.link.potency(this.byId.get(nid)!) : null] as [number, number | null]);
      const est = sarEstimate(nbs);
      rows.push(this.skillRow('Keen eye', est === null ? 'No tested neighbours to learn from yet.' : `Neighbours suggest pIC50 ≈ ${est.toFixed(1)}.`));
    }
    const wantsInsight = (untested && skills.has('foresight')) || (view.status === 'assaying' && skills.has('early_readout'));
    if (wantsInsight) {
      const key = `${c.id}|${view.status}`;
      const ins = this.insights.get(key);
      if (!ins) {
        this.insights.set(key, { id: c.id });
        void this.link.insight(c.id).then((i) => {
          this.insights.set(key, i);
          this.refresh(c.id);
        });
      }
      if (ins?.foresight) rows.push(this.skillRow('Foresight', `The model predicts ${ins.foresight.mean.toFixed(1)} ± ${ins.foresight.sd.toFixed(2)}. Models can be wrong.`));
      if (ins?.readout) rows.push(this.skillRow('Early readout', `The plate reader suggests ${ins.readout.lo.toFixed(1)} to ${ins.readout.hi.toFixed(1)}.`));
    }
    if (!rows.length) return null;
    const box = el('div', 'skill-box');
    box.append(...rows);
    return box;
  }

  private skillRow(name: string, text: string): HTMLElement {
    const r = el('div', 'skill-row');
    r.append(el('b', undefined, `✦ ${name}: `), text);
    return r;
  }

  private neighbourSection(c: Compound): HTMLElement {
    const nb = el('section');
    nb.append(el('h4', undefined, 'Nearest neighbours (chemistry vs map)'));
    const table = el('table', 'nbrs');
    const head = el('tr');
    head.append(el('th', undefined, 'Compound'), el('th', undefined, 'pIC50'), el('th', undefined, 'Tanimoto'), el('th', undefined, 'Tiles away'));
    table.append(head);
    const cliffs = this.link.skills().has('cliff_sense');
    const myP = this.link.potency(c);
    for (const [nid, sim] of this.world.similarity[c.id] ?? []) {
      const n = this.byId.get(nid);
      if (!n) continue;
      const tr = el('tr');
      const go = el('button', undefined, nid);
      go.type = 'button';
      go.title = n.name ?? nid;
      go.addEventListener('click', () => this.open(n));
      const who = el('td');
      who.append(go, ` ${n.name ?? ''}`);
      const simTd = el('td', 'num', sim.toFixed(2));
      const bar = el('span', 'bar');
      bar.style.width = `${Math.round(sim * 48)}px`;
      bar.style.background = simColourCss(sim);
      simTd.append(bar);
      const dist = Math.abs(n.tile_x - c.tile_x) + Math.abs(n.tile_y - c.tile_y);
      const np = this.link.potency(n);
      const potTd = el('td', 'num', np === null ? '?' : np.toFixed(1));
      if (np !== null) potTd.style.color = shadeCss(potencyColour(np));
      if (cliffs && np !== null && myP !== null && sim >= 0.5 && Math.abs(np - myP) >= 1.5) {
        potTd.append(el('span', 'cliff', ' ⚡cliff'));
        potTd.title = `Activity cliff: ΔpIC50 ${(np - myP).toFixed(1)} at Tanimoto ${sim.toFixed(2)}`;
      }
      tr.append(who, potTd, simTd, el('td', 'num', String(dist)));
      table.append(tr);
    }
    nb.append(table);
    return nb;
  }
}
