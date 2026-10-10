import { CLASSES, HAIRS, heroFrame, isValidLook, SKINS, TUNICS, type ClassId, type HeroLook } from '../gfx/characters';
import { css } from '../gfx/paint';
import type { Profile } from '../net/session';

const STORE_KEY = 'chem-explorer:hero';

function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    return p && typeof p.name === "string" && isValidLook(p) ? (p as Profile) : null;
  } catch {
    return null;
  }
}

function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* private mode etc.: the hero just isn't remembered */
  }
}

/** Draws a hero frame scaled up with crisp pixels. */
function paintPortrait(target: HTMLCanvasElement, look: HeroLook, dir: number, frame: number): void {
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  const src = heroFrame(look, dir, frame);
  const s = Math.floor(Math.min(target.width / src.width, target.height / src.height));
  ctx.drawImage(src, (target.width - src.width * s) / 2, target.height - src.height * s, src.width * s, src.height * s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Title screen + character creation. Resolves when the player enters the realm. */
export function createHero(): Promise<Profile> {
  const saved = loadProfile();
  const state: Profile = saved ?? { name: '', cls: 'wizard', tunic: 0, skin: 0, hair: 1 };
  const root = document.getElementById('creator')!;
  root.classList.remove('hidden');

  return new Promise((resolve) => {
    const box = el('div', 'creator-box');
    const title = el('header', 'creator-title');
    title.append(el('h1', undefined, 'Chem Explorer'), el('p', undefined, 'A realm where nearby lands hold similar molecules. Choose who you are in the lab.'));

    const body = el('div', 'creator-body');

    // --- left: preview
    const previewCol = el('div', 'creator-preview');
    const preview = el('canvas');
    preview.width = 16 * 8;
    preview.height = 24 * 8;
    const clsTitle = el('h2');
    const clsRole = el('div', 'role');
    const clsBlurb = el('p', 'blurb');
    previewCol.append(preview, clsTitle, clsRole, clsBlurb);

    // --- right: form
    const form = el('div', 'creator-form');
    const nameLabel = el('label', 'field');
    nameLabel.append(el('span', undefined, 'Name'));
    const name = el('input');
    name.maxLength = 16;
    name.placeholder = 'e.g. Ada the Bold';
    name.value = state.name;
    name.autocomplete = 'off';
    name.spellcheck = false;
    nameLabel.append(name);

    const classGrid = el('div', 'class-grid');
    const classButtons = new Map<ClassId, { btn: HTMLButtonElement; cv: HTMLCanvasElement }>();
    for (const c of CLASSES) {
      const btn = el('button', 'class-card');
      btn.type = 'button';
      const cv = el('canvas');
      cv.width = 16 * 3;
      cv.height = 24 * 3;
      btn.append(cv, el('b', undefined, c.title), el('small', undefined, c.role));
      btn.addEventListener('click', () => {
        state.cls = c.id;
        refresh();
      });
      classGrid.append(btn);
      classButtons.set(c.id, { btn, cv });
    }

    const swatchRow = (label: string, colours: number[], keyName: 'tunic' | 'skin' | 'hair') => {
      const row = el('div', 'field');
      row.append(el('span', undefined, label));
      const wrap = el('div', 'swatches');
      colours.forEach((col, i) => {
        const b = el('button', 'swatch');
        b.type = 'button';
        b.style.background = css(col);
        b.setAttribute('aria-label', `${label} ${i + 1}`);
        b.addEventListener('click', () => {
          state[keyName] = i;
          refresh();
        });
        wrap.append(b);
      });
      row.append(wrap);
      return { row, wrap };
    };
    const tunicRow = swatchRow('Colours', TUNICS, 'tunic');
    const skinRow = swatchRow('Skin', SKINS, 'skin');
    const hairRow = swatchRow('Hair', HAIRS, 'hair');

    const go = el('button', 'enter', 'Enter the realm');
    go.type = 'button';
    const error = el('div', 'error');

    form.append(nameLabel, el('div', 'field-label', 'Class'), classGrid, tunicRow.row, skinRow.row, hairRow.row, error, go);
    body.append(previewCol, form);
    box.append(title, body);
    root.replaceChildren(box);

    function refresh(): void {
      const c = CLASSES.find((k) => k.id === state.cls)!;
      clsTitle.textContent = c.title;
      clsRole.textContent = c.role;
      clsBlurb.textContent = c.blurb;
      for (const [id, { btn, cv }] of classButtons) {
        btn.classList.toggle('selected', id === state.cls);
        paintPortrait(cv, { ...state, cls: id }, 0, 0);
      }
      const mark = (wrap: HTMLElement, idx: number) =>
        [...wrap.children].forEach((ch, i) => ch.classList.toggle('selected', i === idx));
      mark(tunicRow.wrap, state.tunic);
      mark(skinRow.wrap, state.skin);
      mark(hairRow.wrap, state.hair);
    }

    // walk the preview around: down, left, up, right
    let tick = 0;
    const anim = window.setInterval(() => {
      tick++;
      const dir = [0, 1, 3, 2][Math.floor(tick / 8) % 4];
      paintPortrait(preview, state, dir, [1, 0, 2, 0][tick % 4]);
    }, 160);

    const submit = () => {
      const n = name.value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (!n) {
        error.textContent = 'Every adventurer needs a name.';
        name.focus();
        return;
      }
      state.name = n;
      saveProfile(state);
      window.clearInterval(anim);
      root.classList.add('hidden');
      root.replaceChildren();
      resolve({ ...state });
    };
    go.addEventListener('click', submit);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    refresh();
    paintPortrait(preview, state, 0, 0);
    name.focus();
  });
}
