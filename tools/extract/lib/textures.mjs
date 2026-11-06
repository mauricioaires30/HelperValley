import { unpackToContent } from 'xnb';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SPRITES_OUT } from './paths.mjs';

/** Always-exported sheets used by the UI kit (frames, buttons, icons). */
export const UI_TEXTURES = [
  'LooseSprites/Cursors',
  'LooseSprites/Cursors2',
  'LooseSprites/Cursors_1_6',
  'Maps/MenuTiles',
  'LooseSprites/textBox',
];

/** xnb.js logs every step; keep the extractor output readable. */
async function quietly(fn) {
  const { log, info } = console;
  console.log = console.info = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, info });
  }
}

/** Converts each texture asset (e.g. "Maps/springobjects") to public/sprites/<asset>.png. */
export async function exportTextures(gameDir, assets) {
  let written = 0;
  const missing = [];
  for (const asset of [...assets].sort()) {
    const source = path.join(gameDir, 'Content', asset + '.xnb');
    if (!existsSync(source)) {
      missing.push(asset);
      continue;
    }
    const result = await quietly(async () => unpackToContent(await readFile(source)));
    if (!(result.content instanceof Blob)) continue;
    const target = path.join(SPRITES_OUT, asset + '.png');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await result.content.arrayBuffer()));
    written++;
  }
  return { written, missing };
}
