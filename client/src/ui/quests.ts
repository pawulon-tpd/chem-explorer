import { CLASSES } from '../gfx/characters';
import { potencyCss } from '../gfx/activity';
import type { Council, HypView } from '../net/council';
import type { Compound, WorldData } from '../world/types';
import { CLAIMS, claimShapeError, describeClaim, HYP, type Claim, type Stance } from '../../../shared/rules';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const clsTitle = (id: string) => CLASSES.find((c) => c.id === id)?.title ?? id;

export interface QuestLink {
  council(): Council | null;
  potency(c: Compound): number | null;
  openCrystal(id: string): void;
  propose(statement: string, claim: Claim, crystals: string[]): Promise<{ ok: boolean; id?: string; error?: string }>;
  stance(id: string, stance: Stance | null): void;
  note(id: string, text: string): void;
  abandon(id: string): void;
}

/** Quest log: open and resolved hypotheses, plus the propose form. */
export class QuestLog {
  private root = document.getElementById('quests')!;
  private byId: Map<string, Compound>;
  private mode: { kind: 'list' } | { kind: 'propose'; land: number; seed: string | null } = { kind: 'list' };
  private draft = { statement: '', claim: 'hits' as Claim, crystals: [] as string[], error: '' };
  private noteDrafts = new Map<string, string>();
  private showResolved = false;

  constructor(private world: WorldData, private link: QuestLink) {
    this.byId = new Map(world.compounds.map((c) => [c.id, c]));
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.openList();
  }

  openList(): void {
    this.mode = { kind: 'list' };
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  /** Start a hypothesis about this crystal's land, with the crystal pre-selected. */
  proposeFrom(c: Compound): void {
    const land = this.landOf(c);
    this.mode = { kind: 'propose', land, seed: c.id };
    this.draft = { statement: '', claim: 'hits', crystals: [c.id], error: '' };
    this.root.classList.remove('hidden');
    this.render();
  }

  refresh(): void {
    // don't rebuild the form under the player's cursor; list view is safe to redraw
    if (this.isOpen && this.mode.kind === 'list' && !this.root.contains(document.activeElement)) this.render();
  }

  private landOf(c: Compound): number {
    return this.world.regions.find((r) => r.id === c.scaffold_id)?.index ?? 0;
  }

  private landName(index: number): string {
    return this.world.regions.find((r) => r.index === index)?.name ?? `Land ${index}`;
  }

  private render(): void {
    const head = el('div', 'quests-head');
    const title = el('h3', undefined, this.mode.kind === 'propose' ? 'Propose a hypothesis' : 'Quest log');
    const close = el('button', 'close-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close quest log');
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    const body = this.mode.kind === 'propose' ? this.renderPropose(this.mode.land) : this.renderList();
    this.root.replaceChildren(head, body);
  }

  // ------------------------------------------------------------- list

  private renderList(): HTMLElement {
    const wrap = el('div');
    const council = this.link.council();
    if (!council) {
      wrap.append(el('p', 'muted', 'Hypotheses live on the realm server. You are exploring solo, so the quest log is closed.'));
      return wrap;
    }
    wrap.append(el('p', 'muted', 'A hypothesis is a testable claim about crystals in one land. It resolves by itself once every named crystal has been made and assayed. Open one from any crystal card (📜 Propose).'));
    const all = [...council.hypotheses.values()].filter((h) => h.status !== 'abandoned');
    const open = all.filter((h) => h.status === 'open').sort((a, b) => b.createdAt - a.createdAt);
    const done = all.filter((h) => h.status !== 'open').sort((a, b) => b.resolvedAt - a.resolvedAt);

    wrap.append(el('h4', undefined, `Open quests (${open.length})`));
    if (!open.length) wrap.append(el('p', 'muted', 'None yet. Be the first to make a claim.'));
    for (const h of open) wrap.append(this.renderHyp(h, council));

    const toggle = el('button', 'link-btn', `${this.showResolved ? '▾' : '▸'} Resolved (${done.length})`);
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      this.showResolved = !this.showResolved;
      this.render();
    });
    wrap.append(toggle);
    if (this.showResolved) for (const h of done) wrap.append(this.renderHyp(h, council));
    return wrap;
  }

  private renderHyp(h: HypView, council: Council): HTMLElement {
    const me = council.self?.pid;
    const card = el('div', `quest ${h.status}`);
    const top = el('div', 'quest-top');
    const verdict = h.status === 'supported' ? 'Supported ✓' : h.status === 'refuted' ? 'Refuted ✗' : 'Open';
    top.append(el('b', undefined, h.id), el('span', `qstatus ${h.status}`, verdict), el('span', 'muted', this.landName(h.land)));
    card.append(top, el('div', 'statement', `“${h.statement}”`), el('div', 'claim', `Claim: ${describeClaim(h.claim, h.crystals)}.`));

    const chips = el('div', 'qchips');
    for (const id of h.crystals) {
      const c = this.byId.get(id);
      const v = council.crystals.get(id);
      const p = c ? this.link.potency(c) : null;
      const chip = el('button', 'qchip');
      chip.type = 'button';
      const status = v?.status ?? (p === null ? 'untested' : 'tested');
      chip.textContent = p !== null ? `${id} ${p.toFixed(1)}` : status === 'untested' ? `${id} ?` : `${id} ${status === 'queued' ? '⏳' : status === 'synthesising' ? '⚒' : '⚗'}`;
      if (p !== null) chip.style.background = potencyCss(p);
      chip.title = 'Open crystal';
      chip.addEventListener('click', () => this.link.openCrystal(id));
      chips.append(chip);
    }
    card.append(chips);
    card.append(el('div', 'muted', `by ${h.author.name} (${clsTitle(h.author.cls)})`));

    // stances
    const believers = h.stances.filter((s) => s.stance === 'believe');
    const doubters = h.stances.filter((s) => s.stance === 'doubt');
    const stanceRow = el('div', 'stance-row');
    const mine = h.stances.find((s) => s.pid === me)?.stance ?? null;
    const locked = h.status !== 'open' || h.revealed > 0;
    const isAuthor = h.author.pid === me;
    for (const [stance, label, list] of [['believe', '👍 Believe', believers], ['doubt', '🤔 Doubt', doubters]] as [Stance, string, typeof believers][]) {
      const b = el('button', `stance ${stance}${mine === stance ? ' chosen' : ''}`, `${label} · ${list.length}`);
      b.type = 'button';
      b.disabled = locked || isAuthor;
      b.title = list.map((s) => s.name).join(', ') || 'nobody yet';
      b.addEventListener('click', () => this.link.stance(h.id, mine === stance ? null : stance));
      stanceRow.append(b);
    }
    card.append(stanceRow);
    if (h.status === 'open') {
      const why = isAuthor ? 'You authored this, so you believe it.' : locked ? 'Stances are locked: evidence has started to arrive.' : `Right stance: +${HYP.stanceRight} XP when it resolves.`;
      card.append(el('div', 'muted small', why));
    }

    // evidence notes
    if (h.notes.length || h.status === 'open') {
      const notes = el('div', 'notes');
      for (const n of h.notes) {
        const row = el('div', 'note-row');
        row.append(el('b', undefined, `${n.name}: `), n.text);
        notes.append(row);
      }
      if (h.notes.length < HYP.maxNotes) {
        const form = el('form', 'note-form');
        const input = el('input');
        input.maxLength = HYP.noteMax;
        input.placeholder = 'Add evidence or a note…';
        input.value = this.noteDrafts.get(h.id) ?? '';
        input.addEventListener('input', () => this.noteDrafts.set(h.id, input.value));
        const send = el('button', undefined, 'Add');
        send.type = 'submit';
        form.append(input, send);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          this.link.note(h.id, text);
          this.noteDrafts.delete(h.id);
          input.value = '';
          input.blur();
        });
        notes.append(form);
      }
      card.append(notes);
    }

    if (isAuthor && h.status === 'open' && h.revealed === 0) {
      const ab = el('button', 'link-btn danger', 'Abandon this hypothesis');
      ab.type = 'button';
      ab.addEventListener('click', () => this.link.abandon(h.id));
      card.append(ab);
    }
    return card;
  }

  // ------------------------------------------------------------- propose

  private renderPropose(land: number): HTMLElement {
    const form = el('form', 'propose');
    const council = this.link.council();
    if (!council) {
      form.append(el('p', 'muted', 'Hypotheses need the realm server.'));
      return form;
    }
    form.append(el('p', 'muted', `Land: ${this.landName(land)}. Name 1 to ${HYP.maxCrystals} crystals here, including at least one untested. It resolves when they are all assayed.`));

    const rationale = el('label', 'field-col');
    rationale.append(el('span', undefined, 'Rationale'));
    const ta = el('textarea');
    ta.rows = 2;
    ta.maxLength = HYP.statementMax;
    ta.placeholder = 'e.g. A 3-halogen fills the back pocket';
    ta.value = this.draft.statement;
    ta.addEventListener('input', () => (this.draft.statement = ta.value));
    rationale.append(ta);

    const claims = el('div', 'claims');
    for (const c of CLAIMS) {
      const lab = el('label', 'claim-opt');
      const r = el('input');
      r.type = 'radio';
      r.name = 'claim';
      r.checked = this.draft.claim === c.id;
      r.addEventListener('change', () => {
        this.draft.claim = c.id;
        this.render();
      });
      lab.append(r, el('b', undefined, ` ${c.label}`), el('small', undefined, ` ${c.help}`));
      claims.append(lab);
    }

    const picks = el('div', 'picks');
    const inLand = this.world.compounds.filter((c) => this.landOf(c) === land);
    for (const c of inLand) {
      const p = this.link.potency(c);
      const v = council.crystals.get(c.id);
      const lab = el('label', `pick${p === null ? ' untested' : ''}`);
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = this.draft.crystals.includes(c.id);
      cb.addEventListener('change', () => {
        this.draft.crystals = cb.checked ? [...this.draft.crystals, c.id] : this.draft.crystals.filter((x) => x !== c.id);
        this.render();
      });
      const state = p !== null ? p.toFixed(1) : v && v.status !== 'untested' ? v.status : 'untested';
      lab.append(cb, el('b', undefined, ` ${c.id}`), el('small', undefined, ` ${state}`));
      picks.append(lab);
    }

    const order = this.draft.claim === 'beats' && this.draft.crystals.length === 2
      ? el('p', 'muted small', `Order matters: ${this.draft.crystals[0]} is claimed to beat ${this.draft.crystals[1]} (ticked first = first).`)
      : null;
    const preview = el('div', 'claim-preview', this.draft.crystals.length ? `Claim: ${describeClaim(this.draft.claim, this.draft.crystals)}.` : 'Pick crystals below.');
    const err = el('div', 'error', this.draft.error);

    const actions = el('div', 'propose-actions');
    const back = el('button', 'link-btn', '← Back to quest log');
    back.type = 'button';
    back.addEventListener('click', () => this.openList());
    const submit = el('button', 'enter small', 'Propose');
    submit.type = 'submit';
    actions.append(back, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = this.draft;
      const local =
        d.statement.trim().length < HYP.statementMin ? `Write the rationale in at least ${HYP.statementMin} characters.`
        : claimShapeError(d.claim, d.crystals)
        ?? (d.crystals.every((id) => this.link.potency(this.byId.get(id)!) !== null) ? 'Name at least one untested crystal.' : null);
      if (local) {
        d.error = local;
        this.render();
        return;
      }
      submit.disabled = true;
      const res = await this.link.propose(d.statement.trim(), d.claim, d.crystals);
      if (res.ok) {
        this.draft = { statement: '', claim: 'hits', crystals: [], error: '' };
        this.openList();
      } else {
        d.error = res.error ?? 'Could not propose.';
        this.render();
      }
    });

    form.append(rationale, el('div', 'field-label', 'Claim'), claims, el('div', 'field-label', 'Crystals'), picks);
    if (order) form.append(order);
    form.append(preview, err, actions);
    return form;
  }
}
