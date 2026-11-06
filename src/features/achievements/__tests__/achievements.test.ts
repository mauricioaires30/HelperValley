/**
 * Checks computed progress against the achievements the game itself recorded in real saves:
 * any achievement the game marked earned must have reached its goal. Skipped without saves.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSave } from '@/save/normalize';
import goals from '../../../../public/data/achievementGoals.json';
import achievements from '../../../../public/data/achievements.json';
import { achievementProgress } from '../achievements';

const dir = process.env.STARDEW_SAVES_DIR ?? path.join(process.env.APPDATA ?? '', 'StardewValley', 'Saves');
const folders = existsSync(dir) ? readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory()) : [];

describe.skipIf(folders.length === 0)('achievement progress on real saves', () => {
  for (const folder of folders) {
    it(`agrees with earned achievements in ${folder}`, () => {
      const save = normalizeSave(readFileSync(path.join(dir, folder, folder), 'utf8'), folder);
      for (const player of save.players) {
        const progress = achievementProgress(save, player, goals, Object.keys(achievements));
        const wrong = progress.filter((p) => p.earned && p.goal !== null && (p.value ?? 0) < p.goal);
        expect(wrong.map((p) => `${p.id}: ${p.value}/${p.goal}`)).toEqual([]);
      }
    });
  }
});
