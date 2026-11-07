/**
 * Smoke test against the developer's real saves, when present (skipped in CI).
 * Set STARDEW_SAVES_DIR to point elsewhere.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSave, normalizeSummary } from '../normalize';

const dir = process.env.STARDEW_SAVES_DIR ?? path.join(process.env.APPDATA ?? '', 'StardewValley', 'Saves');
const folders = existsSync(dir) ? readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isDirectory()) : [];

describe.skipIf(folders.length === 0)('real saves', () => {
  for (const folder of folders) {
    it(`parses ${folder}`, () => {
      const save = normalizeSave(readFileSync(path.join(dir, folder, folder), 'utf8'), folder);
      const summary = normalizeSummary(readFileSync(path.join(dir, folder, 'SaveGameInfo'), 'utf8'), folder, 0);
      const host = save.players[0];

      expect(host.isHost).toBe(true);
      expect(host.name).toBe(summary.playerName);
      expect(save.date).toEqual({ season: summary.season, day: summary.day, year: summary.year });
      expect(Object.keys(host.friendships).length).toBeGreaterThan(5);
      expect(Object.keys(save.communityCenter.bundleData).length).toBeGreaterThan(20);
      expect(save.containers.length).toBeGreaterThan(0);
      console.log(folder, {
        players: save.players.map((p) => p.name),
        date: save.date,
        bundles: Object.keys(save.communityCenter.bundles).length,
        museum: Object.keys(save.museum).length,
        containers: save.containers.length,
        items: save.containers.reduce((n, c) => n + c.items.length, 0),
        shipped: Object.keys(host.basicShipped).length,
        stats: Object.keys(host.stats).length,
        sample: save.containers[0].items.slice(0, 3),
      });
    });
  }
});

describe.skipIf(folders.length === 0)('farm on real saves', () => {
  for (const folder of folders) {
    it(`reads planting areas and animals in ${folder}`, () => {
      const save = normalizeSave(readFileSync(path.join(dir, folder, folder), 'utf8'), folder);
      const farm = save.farm.areas.find((a) => a.location === 'Farm');
      expect(farm).toBeDefined();
      expect(farm!.tilled).toBeGreaterThan(0);
      for (const crop of farm!.crops) expect(crop.daysToHarvest).toBeGreaterThanOrEqual(-1);
      console.log(folder, {
        areas: save.farm.areas.map((a) => [a.location, a.tilled, a.pots, a.crops.length, a.sprinklerTiles, a.beeHouses]),
        animals: save.farm.animals.length,
        silos: save.farm.silos,
        hay: save.farm.hay,
        sample: farm!.crops.slice(0, 2),
      });
    });
  }
});
