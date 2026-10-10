import Phaser from 'phaser';
import { POTENCY_GRADIENT } from './gfx/activity';
import { Session } from './net/session';
import { WorldScene } from './scenes/WorldScene';
import './style.css';
import { createHero } from './ui/creator';
import { initRDKit } from './ui/rdkit';
import { loadWorld } from './world/loadWorld';

/** Phaser sizes its WebGL framebuffers at boot; a 0x0 parent (hidden tab/iframe) makes that fail. */
function whenSized(el: HTMLElement): Promise<void> {
  if (el.clientWidth > 0 && el.clientHeight > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        ro.disconnect();
        resolve();
      }
    });
    ro.observe(el);
  });
}

function fatal(msg: string): void {
  const div = document.createElement('div');
  div.id = 'fatal';
  div.textContent = msg;
  document.body.append(div);
  document.getElementById('hud')?.classList.add('hidden');
}

async function boot(): Promise<void> {
  void initRDKit(); // start fetching the WASM while the player creates a hero
  const worldP = loadWorld();
  worldP.catch(() => {}); // reported below
  const profile = await createHero();

  let loaded;
  try {
    loaded = await worldP;
  } catch (e) {
    fatal(`Could not load the world: ${(e as Error).message}. Run pipeline/build_world.py to create client/public/world.json.`);
    return;
  }
  document.getElementById('hud')!.classList.remove('hidden');
  document.getElementById('potency-ramp')!.style.background = POTENCY_GRADIENT;

  const scene = new WorldScene(loaded, profile);
  const session = await Session.connect(profile, scene.netEvents());
  scene.attachSession(session);

  const parent = document.getElementById('game')!;
  await whenSized(parent);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    backgroundColor: '#0d1424',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: [scene],
  });
  window.addEventListener('beforeunload', () => session?.leave());
  if (import.meta.env.DEV) Object.assign(window, { game, session });
}

void boot();
