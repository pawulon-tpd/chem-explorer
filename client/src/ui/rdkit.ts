import type { RDKitModule } from '@rdkit/rdkit';
import type { Compound } from '../world/types';

let pending: Promise<RDKitModule> | null = null;

/** Starts loading the WASM module once; later calls share the same promise. */
export function initRDKit(): Promise<RDKitModule> {
  if (!pending) {
    pending = (async () => {
      // window.initRDKitModule is typed by @rdkit/rdkit; it exists once the <script> has loaded.
      if (typeof window.initRDKitModule !== 'function') throw new Error('RDKit_minimal.js was not loaded');
      return window.initRDKitModule({ locateFile: () => './rdkit/RDKit_minimal.wasm' });
    })();
    pending.catch((e) => console.error('[rdkit]', e));
  }
  return pending;
}

/** SVG depiction; prefers the molblock (keeps pipeline 2D coords), falls back to SMILES. */
export async function depict(c: Compound, width: number, height: number): Promise<string> {
  const rd = await initRDKit();
  let mol = null;
  for (const input of [c.molblock, c.smiles]) {
    if (!input) continue;
    try {
      mol = rd.get_mol(input);
    } catch {
      mol = null;
    }
    if (mol) break;
  }
  if (!mol) throw new Error(`RDKit could not parse ${c.id}`);
  try {
    return mol.get_svg(width, height);
  } finally {
    mol.delete();
  }
}
