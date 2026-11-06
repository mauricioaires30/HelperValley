import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const CACHE_DIR = path.join(ROOT, 'tools/extract/.cache/raw');
export const DATA_OUT = path.join(ROOT, 'public/data');
export const SPRITES_OUT = path.join(ROOT, 'public/sprites');
export const DEFAULT_GAME_DIR = 'C:/Program Files (x86)/Steam/steamapps/common/Stardew Valley';

/** Languages exported for the site, as [site key, game file suffix]. */
export const LANGUAGES = [
  ['en', ''],
  ['pt', '.pt-BR'],
];
