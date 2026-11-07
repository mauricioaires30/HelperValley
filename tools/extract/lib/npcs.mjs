import { readRaw } from './raw.mjs';
import { localize } from './strings.mjs';

const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const TASTES = ['love', 'like', 'dislike', 'hate', 'neutral'];

const parseIds = (s) => (s ?? '').split(' ').filter(Boolean);

/** Builds villager data: names, birthdays, romance flags and gift tastes. */
export function buildNpcs(textures) {
  const characters = readRaw('Data/Characters');
  const tastes = readRaw('Data/NPCGiftTastes');
  const npcs = {};

  for (const [key, c] of Object.entries(characters)) {
    const row = tastes[key]?.split('/');
    const gifts = row ? Object.fromEntries(TASTES.map((t, i) => [t, parseIds(row[i * 2 + 1])])) : null;
    const hasPortrait = readRaw(`Characters/Dialogue/${key}`) !== null || c.CanReceiveGifts;
    // Some NPCs use a texture with another name (Leo → ParrotBoy, Mister Qi → MrQi).
    const tex = (c.TextureName ?? key).replace(/\\/g, '/');
    if (hasPortrait) {
      textures.add(`Portraits/${tex}`);
      textures.add(`Characters/${tex}`);
    }
    npcs[key] = {
      n: localize(c.DisplayName, key),
      birth: c.BirthSeason != null && c.BirthDay ? { season: SEASONS[c.BirthSeason], day: c.BirthDay } : null,
      romance: c.CanBeRomanced,
      gifts: c.CanReceiveGifts ? gifts : null,
      social: c.SocialTab,
      perfection: c.PerfectionScore,
      region: c.HomeRegion,
      tex,
      size: [c.Size?.X ?? 16, c.Size?.Y ?? 32],
    };
  }

  const universal = Object.fromEntries(
    TASTES.map((t) => [t, parseIds(tastes[`Universal_${t[0].toUpperCase()}${t.slice(1)}`])]),
  );
  return { npcs, universalGifts: universal };
}

/**
 * Adds the first visible row of each NPC's first sprite frame (where the head starts),
 * so the site can crop a head icon for small and tall sprites alike.
 */
export function addHeadOffsets(npcs, readPng) {
  for (const npc of Object.values(npcs)) {
    const png = readPng(`Characters/${npc.tex}`);
    if (!png) continue;
    const [w, h] = npc.size;
    let top = 0;
    search: for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (png.data[(y * png.width + x) * 4 + 3] > 0) {
          top = y;
          break search;
        }
      }
    }
    npc.head = top;
  }
}
