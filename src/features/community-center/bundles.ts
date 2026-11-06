import type { BundleStrings, LocalizedName } from '@/data/gameData';
import type { SaveData } from '@/save/model';
import { findItem, type ItemLocation } from '@/save/inventory';

export interface BundleSlot {
  /** Qualified item id, or "money" for Vault bundles. */
  id: string;
  count: number;
  quality: 0 | 1 | 2 | 4;
  done: boolean;
  /** Matching stacks the farm already owns (empty for money). */
  owned: ItemLocation[];
}

export interface Bundle {
  index: number;
  name: LocalizedName;
  /** Bundle color index (0 green ... 6 teal), drives the accent color. */
  color: number;
  /** Slots needed to complete (some bundles accept any N of more items). */
  required: number;
  slots: BundleSlot[];
  doneCount: number;
  complete: boolean;
  reward: { id: string; count: number } | null;
}

export interface Room {
  /** Area id, e.g. "Pantry". */
  id: string;
  areaIndex: number;
  name: LocalizedName;
  complete: boolean;
  bundles: Bundle[];
}

const QUALITIES = [0, 1, 2, 4] as const;
const asQuality = (n: number) => (QUALITIES.includes(n as 0) ? n : 0) as BundleSlot['quality'];

/** "O 465 20" → reward item. */
function parseReward(raw: string): Bundle['reward'] {
  const [type, id, count] = raw.split(' ');
  if (!type || !id) return null;
  const prefix = type === 'BO' ? '(BC)' : type === 'O' ? '(O)' : `(${type})`;
  return { id: id.startsWith('(') ? id : prefix + id, count: Number(count) || 1 };
}

/**
 * Builds the Community Center state from this save's bundle definitions and progress.
 * bundleData values: "Name/reward/id count quality .../color/required/sprite/displayName".
 */
export function buildRooms(save: SaveData, strings: BundleStrings): Room[] {
  const cc = save.communityCenter;
  const rooms = new Map<string, Room>();
  strings.areas.forEach((area, areaIndex) => {
    rooms.set(area.id, { id: area.id, areaIndex, name: area.n, complete: cc.areasComplete[areaIndex] ?? false, bundles: [] });
  });

  for (const [key, raw] of Object.entries(cc.bundleData)) {
    const [roomName, indexText] = key.split('/');
    const room = rooms.get(roomName.replace(/\s+/g, ''));
    if (!room) continue;
    const index = Number(indexText);
    const fields = raw.split('/');
    const tokens = fields[2].split(' ').filter(Boolean);
    const flags = cc.bundles[String(index)] ?? [];

    const slots: BundleSlot[] = [];
    for (let i = 0; i + 2 < tokens.length; i += 3) {
      const [id, count, quality] = [tokens[i], Number(tokens[i + 1]), asQuality(Number(tokens[i + 2]))];
      const isMoney = id === '-1';
      slots.push({
        id: isMoney ? 'money' : id.startsWith('(') ? id : `(O)${id}`,
        count,
        quality,
        done: room.complete || (flags[i / 3] ?? false),
        owned: isMoney ? [] : findItem(save, id, quality),
      });
    }

    const required = Number(fields[4]) > 0 ? Number(fields[4]) : slots.length;
    const doneCount = slots.filter((s) => s.done).length;
    const englishName = fields[0];
    room.bundles.push({
      index,
      name: strings.names[englishName] ?? [englishName, fields[6] || englishName],
      color: Number(fields[3]) || 0,
      required,
      slots,
      doneCount: Math.min(doneCount, required),
      complete: room.complete || doneCount >= required,
      reward: parseReward(fields[1]),
    });
  }

  for (const room of rooms.values()) room.bundles.sort((a, b) => a.index - b.index);
  return [...rooms.values()].filter((r) => r.bundles.length > 0);
}

/** Joja Community Development projects: mail flag, cost and unlock, in purchase-form order. */
export const JOJA_PROJECTS = [
  { flag: 'jojaBoilerRoom', area: 'BoilerRoom', cost: 15000, unlock: 'minecarts' },
  { flag: 'jojaCraftsRoom', area: 'CraftsRoom', cost: 25000, unlock: 'bridge' },
  { flag: 'jojaFishTank', area: 'FishTank', cost: 20000, unlock: 'panning' },
  { flag: 'jojaPantry', area: 'Pantry', cost: 35000, unlock: 'greenhouse' },
  { flag: 'jojaVault', area: 'Vault', cost: 40000, unlock: 'bus' },
] as const;

export function jojaProgress(save: SaveData) {
  const flags = new Set([...save.broadcastedMail, ...save.players.flatMap((p) => p.mailReceived)]);
  return JOJA_PROJECTS.map((p) => ({ ...p, done: flags.has(p.flag) }));
}
