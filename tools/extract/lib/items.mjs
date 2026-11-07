import { readRaw } from './raw.mjs';
import { localize, resolveText } from './strings.mjs';
import { LANGUAGES } from './paths.mjs';

const normTexture = (t, fallback) => (t ?? fallback).replace(/\\/g, '/');

/**
 * Builds the item index keyed by qualified item id, e.g. "(O)24".
 * Each entry: { n: [names per language], s: [texture, spriteIndex, width, height], ...extra }.
 */
export function buildItems(textures) {
  const items = {};
  const add = (id, name, texture, index, w, h, extra = {}) => {
    textures.add(texture);
    items[id] = { n: name, s: [texture, index, w, h], ...extra };
  };

  for (const [id, o] of Object.entries(readRaw('Data/Objects'))) {
    add(`(O)${id}`, localize(o.DisplayName, o.Name), normTexture(o.Texture, 'Maps/springobjects'), o.SpriteIndex, 16, 16, {
      c: o.Category,
      p: o.Price,
      t: o.Type,
      ...(o.Edibility > -300 ? { e: o.Edibility } : {}),
      ...(o.ContextTags?.length ? { tags: o.ContextTags } : {}),
      ...(o.ExcludeFromShippingCollection ? { noShip: true } : {}),
      ...(o.ExcludeFromFishingCollection ? { noFish: true } : {}),
    });
  }

  for (const [id, o] of Object.entries(readRaw('Data/BigCraftables'))) {
    add(`(BC)${id}`, localize(o.DisplayName, o.Name), normTexture(o.Texture, 'TileSheets/Craftables'), o.SpriteIndex, 16, 32, { p: o.Price });
  }

  for (const [id, w] of Object.entries(readRaw('Data/Weapons'))) {
    add(`(W)${id}`, localize(w.DisplayName, w.Name), normTexture(w.Texture, 'TileSheets/weapons'), w.SpriteIndex, 16, 16, {
      wt: w.Type,
      dmg: [w.MinDamage, w.MaxDamage],
      lvl: w.MineBaseLevel,
    });
  }

  for (const [id, t] of Object.entries(readRaw('Data/Tools'))) {
    add(`(T)${id}`, localize(t.DisplayName, t.Name), normTexture(t.Texture, 'TileSheets/tools'), t.MenuSpriteIndex >= 0 ? t.MenuSpriteIndex : t.SpriteIndex, 16, 16, { lvl: t.UpgradeLevel });
  }

  for (const [id, t] of Object.entries(readRaw('Data/Trinkets'))) {
    add(`(TR)${id}`, localize(t.DisplayName, id), normTexture(t.Texture, 'TileSheets/Objects_2'), t.SheetIndex, 16, 16);
  }

  // Legacy slash-delimited formats: the localized display name is the last field.
  const legacyNames = (asset, id) =>
    LANGUAGES.map(([, suffix]) => {
      const row = (readRaw(asset + suffix) ?? readRaw(asset))[id];
      return row.split('/').at(-1);
    });

  for (const id of Object.keys(readRaw('Data/Boots'))) {
    add(`(B)${id}`, legacyNames('Data/Boots', id), 'Maps/springobjects', Number(id), 16, 16);
  }
  for (const id of Object.keys(readRaw('Data/Hats'))) {
    // Hat sheet: 12 hats per row, each 20x80 (four facing frames); the first frame is the icon.
    add(`(H)${id}`, legacyNames('Data/Hats', id), 'Characters/Farmer/hats', Number(id), 20, 20, { hat: true });
  }

  // Items with a free-form source rect: s = [texture, -1, w, h] plus r = [x, y].
  const addRect = (id, name, texture, x, y, w, h, extra = {}) => {
    textures.add(texture);
    items[id] = { n: name, s: [texture, -1, w, h], r: [x, y], ...extra };
  };
  // Furniture: "name/type/size/box/rotations/price/placement/displayName/spriteIndex/texture/offLimits".
  // The sprite index counts 16px tiles across the sheet (Furniture.GetDefaultSourceRect); `f` tells the site to place it that way.
  const FURNITURE_SIZE = { chair: [1, 2], bench: [2, 2], couch: [3, 2], armchair: [2, 2], dresser: [2, 2], 'long table': [5, 3], painting: [2, 2], lamp: [1, 3], decor: [1, 2], bookcase: [2, 3], table: [2, 3], rug: [3, 2], window: [1, 2], fireplace: [2, 5], torch: [1, 2], sconce: [1, 2] };
  for (const [id, raw] of Object.entries(readRaw('Data/Furniture'))) {
    const f = raw.split('/');
    const texture = normTexture(f[9] || null, 'TileSheets/furniture').replace(/\/+/g, '/');
    const index = f[8] ? Number(f[8]) : Number(id);
    const [tw, th] = f[2] === '-1' ? (FURNITURE_SIZE[f[1].toLowerCase()] ?? [1, 2]) : f[2].split(' ').map(Number);
    const name = LANGUAGES.map(([, suffix]) => resolveText(f[7], suffix) || f[0]);
    add(`(F)${id}`, name, texture, index, tw * 16, th * 16, { p: Number(f[5]), f: 1 });
  }

  // Shirts: 8x8 menu icon in a 128px-wide block, 32px rows (Clothing.drawInMenu).
  for (const [id, s] of Object.entries(readRaw('Data/Shirts'))) {
    const i = s.SpriteIndex;
    addRect(`(S)${id}`, localize(s.DisplayName, s.Name), normTexture(s.Texture, 'Characters/Farmer/shirts'), (i * 8) % 128, Math.floor((i * 8) / 128) * 32, 8, 8, { z: 2 });
  }
  // Pants: the 16x16 icon at the bottom of each 192x688 block.
  for (const [id, p] of Object.entries(readRaw('Data/Pants'))) {
    const i = p.SpriteIndex;
    addRect(`(P)${id}`, localize(p.DisplayName, p.Name), normTexture(p.Texture, 'Characters/Farmer/pants'), (i % 10) * 192, Math.floor(i / 10) * 688 + 672, 16, 16);
  }
  // Wallpaper (16x48) and flooring (32x32) from walls_and_floors.
  const wallName = localize('[LocalizedText Strings\\StringsFromCSFiles:Wallpaper.cs.13204]');
  const floorName = localize('[LocalizedText Strings\\StringsFromCSFiles:Wallpaper.cs.13203]');
  for (let i = 0; i < 112; i++) addRect(`(WP)${i}`, wallName.map((n) => `${n} #${i}`), 'Maps/walls_and_floors', (i % 16) * 16, Math.floor(i / 16) * 48, 16, 48);
  for (let i = 0; i < 88; i++) addRect(`(FL)${i}`, floorName.map((n) => `${n} #${i}`), 'Maps/walls_and_floors', (i % 8) * 32, 336 + Math.floor(i / 8) * 32, 32, 32);
  // Mannequins: 16x32 cells.
  for (const [id, m] of Object.entries(readRaw('Data/Mannequins') ?? {})) {
    add(`(M)${id}`, localize(m.DisplayName, id), normTexture(m.Texture, 'TileSheets/Mannequins'), m.SheetIndex, 16, 32);
  }

  return items;
}
