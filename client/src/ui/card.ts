import { measured, potencyColour, potencyCss, UNTESTED } from '../gfx/activity';
import type { Compound, WorldData } from '../world/types';
import { shade } from '../gfx/paint';
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

/** DOM overlay showing one compound. Clicking a neighbour navigates to it. */
export class CompoundCard {
  private root = document.getElementById('card')!;
  private byId: Map<string, Compound>;
  private current: Compound | null = null;

  constructor(
    private world: WorldData,
    private hooks: { opened?: (c: Compound) => void; closed?: () => void } = {},
  ) {
    this.byId = new Map(world.compounds.map((c) => [c.id, c]));
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  open(c: Compound): void {
    this.current = c;
    const region = this.world.regions.find((r) => `scaf_${r.index}` === c.scaffold_id || r.id === c.scaffold_id);
    const card = el('div', 'card');

    const header = el('header');
    const swatch = el('span', 'swatch');
    const p = measured(c);
    swatch.style.background = hex(p === null ? UNTESTED : potencyColour(p));
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());
    header.append(swatch, el('span', 'id', c.id), el('span', 'name', c.name ?? ''), close);

    const structure = el('div', 'structure', 'Drawing structure…');
    const smiles = el('div', 'smiles', c.smiles);

    const act = el('section', 'activity');
    act.append(el('h4', undefined, 'Activity'));
    if (p !== null) {
      const row = el('div', 'act-row');
      const pill = el('span', 'pill', `pIC50 ${p.toFixed(1)}`);
      pill.style.background = potencyCss(p);
      const nm = Math.pow(10, 9 - p);
      const um = nm / 1000;
      const ic50 = nm >= 1000 ? `${um >= 10 ? um.toFixed(0) : um.toFixed(1)} µM` : `${nm >= 10 ? Math.round(nm) : nm.toFixed(1)} nM`;
      row.append(pill, el('span', undefined, `IC50 ≈ ${ic50} vs ${c.activity!.target}`));
      act.append(row);
      if (c.activity!.source === 'illustrative') act.append(el('div', 'note', 'Illustrative demo value, not a literature measurement.'));
    } else {
      const row = el('div', 'act-row');
      row.append(el('span', 'pill untested', 'untested'), el('span', undefined, c.activity?.target ? `Not yet measured vs ${c.activity.target}.` : 'No assay data.'));
      act.append(row, el('div', 'note', 'An unlit crystal: worth making and testing?'));
    }

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
    regionLine.append('Region ', el('b', undefined, region?.name ?? c.scaffold_id));
    if (region?.scaffold_smiles) regionLine.append(` · scaffold ${region.scaffold_smiles}`);
    const tileLine = el('div', undefined, `Tile (${c.tile_x}, ${c.tile_y})`);
    if (c.displacement !== undefined) tileLine.append(` · moved ${c.displacement.toFixed(1)} tiles when snapped to the grid`);
    meta.append(regionLine, tileLine);

    const nb = el('section');
    nb.append(el('h4', undefined, 'Nearest neighbours (chemistry vs map)'));
    const table = el('table', 'nbrs');
    const head = el('tr');
    head.append(el('th', undefined, 'Compound'), el('th', undefined, 'pIC50'), el('th', undefined, 'Tanimoto'), el('th', undefined, 'Tiles away'));
    table.append(head);
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
      const np = measured(n);
      const potTd = el('td', 'num', np === null ? '?' : np.toFixed(1));
      if (np !== null) potTd.style.color = shadeCss(potencyColour(np));
      tr.append(who, potTd, simTd, el('td', 'num', String(dist)));
      table.append(tr);
    }
    nb.append(table);

    card.append(header, structure, smiles, act, props, meta, nb);
    this.root.replaceChildren(card);
    this.root.classList.remove('hidden');
    close.focus();
    this.hooks.opened?.(c);

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
    this.current = null;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
}
