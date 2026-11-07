import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SPRITES_OUT } from './paths.mjs';

/**
 * Named crops from the game's UI sheets, written to public/sprites/ui/<name>.png so CSS can use
 * them directly (border-image, backgrounds). Rects are the same source rects the game uses.
 */
export const UI_CROPS = {
  'menu-box': ['Maps/MenuTiles', 0, 256, 60, 60],
  'dialog-box': ['LooseSprites/Cursors', 384, 373, 18, 18],
  'inset-box': ['LooseSprites/Cursors', 403, 373, 9, 9],
  'item-slot': ['LooseSprites/Cursors', 293, 360, 24, 24],
  tab: ['LooseSprites/Cursors', 16, 368, 16, 16],
  'ok-button': ['LooseSprites/Cursors', 128, 256, 64, 64],
  'arrow-left': ['LooseSprites/Cursors', 0, 256, 64, 64],
  'heart-full': ['LooseSprites/Cursors', 211, 428, 7, 6],
  'heart-empty': ['LooseSprites/Cursors', 218, 428, 7, 6],
  'star-silver': ['LooseSprites/Cursors', 338, 400, 8, 8],
  'star-gold': ['LooseSprites/Cursors', 346, 400, 8, 8],
  'star-iridium': ['LooseSprites/Cursors', 346, 392, 8, 8],
  'season-spring': ['LooseSprites/Cursors', 406, 441, 12, 8],
  'season-summer': ['LooseSprites/Cursors', 406, 449, 12, 8],
  'season-fall': ['LooseSprites/Cursors', 406, 457, 12, 8],
  'season-winter': ['LooseSprites/Cursors', 406, 465, 12, 8],
  'wood-planks': ['Maps/MenuTiles', 128, 1024, 64, 64],
  'text-box': ['LooseSprites/textBox', 0, 0, 192, 48],
  // Animated festival flag from the calendar billboard: 6 frames of 14x12.
  'festival-flag': ['LooseSprites/Billboard', 1, 398, 84, 12],
  // Menu icons.
  'nav-calendar': ['LooseSprites/Billboard', 1, 398, 14, 12],
  junimo: ['Characters/Junimo', 0, 0, 16, 16],
};

export function exportUiCrops() {
  const sheets = new Map();
  const load = (asset) => {
    if (!sheets.has(asset)) sheets.set(asset, PNG.sync.read(readFileSync(path.join(SPRITES_OUT, asset + '.png'))));
    return sheets.get(asset);
  };

  const outDir = path.join(SPRITES_OUT, 'ui');
  mkdirSync(outDir, { recursive: true });
  for (const [name, [asset, x, y, w, h]] of Object.entries(UI_CROPS)) {
    const src = load(asset);
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(src, out, x, y, w, h, 0, 0);
    writeFileSync(path.join(outDir, `${name}.png`), PNG.sync.write(out));
  }
  return Object.keys(UI_CROPS).length;
}
