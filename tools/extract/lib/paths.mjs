import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const CACHE_DIR = path.join(ROOT, 'tools/extract/.cache/raw');
export const DATA_OUT = path.join(ROOT, 'public/data');
export const SPRITES_OUT = path.join(ROOT, 'public/sprites');
/** Steam's install folder per OS (macOS keeps the game's Content inside the app bundle). */
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';
export const DEFAULT_GAME_DIR =
  process.platform === 'darwin'
    ? `${HOME}/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/Resources`
    : process.platform === 'linux'
      ? `${HOME}/.local/share/Steam/steamapps/common/Stardew Valley`
      : 'C:/Program Files (x86)/Steam/steamapps/common/Stardew Valley';

/** Languages exported for the site, as [site key, game file suffix]. */
export const LANGUAGES = [
  ['en', ''],
  ['pt', '.pt-BR'],
];
