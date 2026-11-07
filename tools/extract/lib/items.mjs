import { readRaw } from './raw.mjs';
import { localize } from './strings.mjs';
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

  return items;
}
