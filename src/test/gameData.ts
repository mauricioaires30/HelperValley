import { readFileSync } from 'node:fs';
import { setGameData, type GameData } from '@/data/gameData';

const NAMES = ['items', 'npcs', 'universalGifts', 'sheets', 'bundles', 'achievements', 'achievementGoals', 'museum', 'calendar', 'heartEvents', 'farm', 'worldMap', 'schedules', 'fish', 'walnuts'];

/** Loads public/data into the game data module for tests. */
export function loadTestGameData() {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8'));
  setGameData(Object.fromEntries(NAMES.map((n) => [n, read(n)])) as unknown as GameData);
}
