// Copy RDKit_minimal.js/.wasm from node_modules into public/rdkit/ so they are
// served as static files (the .js is loaded via a <script> tag, not bundled).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@rdkit', 'rdkit', 'dist');
const dst = join(root, 'public', 'rdkit');
mkdirSync(dst, { recursive: true });
for (const f of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.error(`[copy-rdkit] missing ${from} — run npm install`);
    process.exit(1);
  }
  copyFileSync(from, join(dst, f));
}
console.log('[copy-rdkit] copied RDKit_minimal.{js,wasm} -> public/rdkit/');
