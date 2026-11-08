#!/usr/bin/env node
/**
 * Extracts game data and sprites from a local Stardew Valley install into public/.
 *
 *   npm run extract -- [--game "<game dir>"] [--skip-dump]
 *
 * Step 1 (C#, needs .NET 8 SDK) dumps data assets to tools/extract/.cache/raw as JSON.
 * Step 2 (this script) builds the compact datasets the site loads and converts textures to PNG.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, DATA_OUT, DEFAULT_GAME_DIR, ROOT, SPRITES_OUT } from './lib/paths.mjs';
import { buildItems } from './lib/items.mjs';
import { addHeadOffsets, buildNpcs } from './lib/npcs.mjs';
import { PNG } from 'pngjs';
import { buildAchievementGoals, buildAchievements, buildBundles, buildMuseum } from './lib/collections.mjs';
import { buildCalendar, buildHeartEvents } from './lib/calendar.mjs';
import { buildFarm } from './lib/farm.mjs';
import { buildSchedules, buildWorldMap } from './lib/worldmap.mjs';
import { buildNpcPaths } from './lib/npcPaths.mjs';
import { addFishSpots, buildFish } from './lib/fish.mjs';
import { buildWalnutSpots } from './lib/walnuts.mjs';
import { buildGameCollections } from './lib/collectionsGame.mjs';
import { buildPlayer } from './lib/player.mjs';
import { buildShops } from './lib/shops.mjs';
import { exportTextures, UI_TEXTURES } from './lib/textures.mjs';
import { exportUiCrops } from './lib/ui.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const gameDir = option('--game', process.env.STARDEW_GAME_DIR ?? DEFAULT_GAME_DIR);
if (!existsSync(path.join(gameDir, 'Content'))) {
  console.error(`Game folder not found: ${gameDir}\nPass --game "<path to Stardew Valley>".`);
  process.exit(1);
}

if (!flag('--skip-dump') || !existsSync(CACHE_DIR)) {
  console.log('Dumping game data with the .NET dumper...');
  execFileSync(
    'dotnet',
    ['run', '-c', 'Release', '--project', path.join(ROOT, 'tools/extract/dumper'), `-p:GameDir=${gameDir}`, '--', gameDir, CACHE_DIR],
    { stdio: 'inherit' },
  );
}

const textures = new Set(UI_TEXTURES);
const datasets = {
  items: buildItems(textures),
  ...buildNpcs(textures),
  bundles: buildBundles(),
  achievements: buildAchievements(),
  achievementGoals: buildAchievementGoals(),
  museum: buildMuseum(),
  calendar: buildCalendar(),
  heartEvents: buildHeartEvents(),
  farm: buildFarm(textures),
  worldMap: await buildWorldMap(gameDir, textures),
  schedules: buildSchedules(),
  npcPaths: await buildNpcPaths(gameDir),
  fish: await addFishSpots(buildFish(), gameDir),
  walnuts: buildWalnutSpots(gameDir),
  gameCollections: buildGameCollections(),
  player: buildPlayer(textures),
  shops: buildShops(textures),
};

await rm(DATA_OUT, { recursive: true, force: true });
await mkdir(DATA_OUT, { recursive: true });
for (const [name, value] of Object.entries(datasets)) {
  await writeFile(path.join(DATA_OUT, `${name}.json`), JSON.stringify(value));
}
await writeFile(
  path.join(DATA_OUT, 'meta.json'),
  JSON.stringify({ extractedAt: new Date().toISOString().slice(0, 10), datasets: Object.keys(datasets) }, null, 2),
);
console.log(`Wrote ${Object.keys(datasets).length} datasets to public/data`);

await rm(SPRITES_OUT, { recursive: true, force: true });
const { written, missing, sizes } = await exportTextures(gameDir, textures);
await writeFile(path.join(DATA_OUT, 'sheets.json'), JSON.stringify(sizes));

// Head offsets need the exported PNGs, so npcs.json is written again with them.
addHeadOffsets(datasets.npcs, (asset) => {
  const file = path.join(SPRITES_OUT, asset + '.png');
  return existsSync(file) ? PNG.sync.read(readFileSync(file)) : null;
});
await writeFile(path.join(DATA_OUT, 'npcs.json'), JSON.stringify(datasets.npcs));
console.log(`Wrote ${written} sprite sheets to public/sprites`);
if (missing.length) console.log(`  (not in this game version, skipped: ${missing.join(', ')})`);
console.log(`Wrote ${exportUiCrops()} UI crops to public/sprites/ui`);
