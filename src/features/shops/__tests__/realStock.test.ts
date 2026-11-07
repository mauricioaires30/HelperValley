/**
 * Prints predicted stock for the developer's real saves (skipped in CI), to compare with the game.
 * Set STARDEW_SAVES_DIR to point elsewhere.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getItem } from '@/data/gameData';
import { normalizeSave } from '@/save/normalize';
import { loadTestGameData } from '@/test/gameData';
import { shiftDay, shopStock, type ShopDay } from '../stock';

const dir = process.env.STARDEW_SAVES_DIR ?? path.join(process.env.APPDATA ?? '', 'StardewValley', 'Saves');
const folders = existsSync(dir) ? readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory()) : [];

beforeAll(loadTestGameData);

describe.skipIf(folders.length === 0)('real save stock', () => {
  for (const folder of folders) {
    it(`predicts shops for ${folder}`, () => {
      const save = normalizeSave(readFileSync(path.join(dir, folder, folder), 'utf8'), folder);
      const player = save.players[0];
      const today: ShopDay = { ...save.date, daysPlayed: player.stats.daysPlayed ?? 0 };
      const lines: string[] = [];
      for (let offset = 0; offset < 7; offset++) {
        const day = shiftDay(today, offset);
        for (const shop of ['Traveler', 'ShadowShop', 'Carpenter', 'Sandy', 'SeedShop']) {
          const { items, uncertainFrom } = shopStock(shop, save, player, day);
          const random = items.filter((i) => shop !== 'SeedShop' || /\((WP|FL)\)/.test(i.id));
          if (shop === 'Traveler' && ![5, 0].includes((day.day - 1) % 7 === 6 ? 0 : ((day.day - 1) % 7) + 1)) continue;
          lines.push(
            `${day.season} ${day.day} y${day.year} (dp ${day.daysPlayed}) ${shop}${uncertainFrom !== null ? ` [uncertain from ${uncertainFrom}]` : ''}: ` +
              random
                .slice(0, 14)
                .map((i) => `${getItem(i.id)?.n[0] ?? i.id} ${i.price}g${i.stock !== null && i.stock !== 1 ? ` x${i.stock}` : ''}${i.maybe ? '?' : ''}`)
                .join(', '),
          );
        }
      }
      console.log(lines.join('\n'));
      expect(lines.length).toBeGreaterThan(0);
    });
  }
});
