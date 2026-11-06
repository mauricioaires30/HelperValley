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
    if (hasPortrait) {
      textures.add(`Portraits/${key}`);
      textures.add(`Characters/${key}`);
    }
    npcs[key] = {
      n: localize(c.DisplayName, key),
      birth: c.BirthSeason != null && c.BirthDay ? { season: SEASONS[c.BirthSeason], day: c.BirthDay } : null,
      romance: c.CanBeRomanced,
      gifts: c.CanReceiveGifts ? gifts : null,
      social: c.SocialTab,
      perfection: c.PerfectionScore,
      region: c.HomeRegion,
    };
  }

  const universal = Object.fromEntries(
    TASTES.map((t) => [t, parseIds(tastes[`Universal_${t[0].toUpperCase()}${t.slice(1)}`])]),
  );
  return { npcs, universalGifts: universal };
}
