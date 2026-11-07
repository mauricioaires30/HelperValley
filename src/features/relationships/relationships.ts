import { gameData, type HeartEvent } from '@/data/gameData';
import type { Player, SaveData } from '@/save/model';
import { daysUntil } from '@/features/calendar/calendar';

export const POINTS_PER_HEART = 250;

export interface Relationship {
  npc: string;
  points: number;
  hearts: number;
  /** Hearts reachable now: 8 for unwed romanceables, 14 for a spouse, else 10. */
  maxHearts: number;
  status: string;
  giftsThisWeek: number;
  giftsToday: number;
  /** Days until the NPC's birthday (0 = today). */
  birthdayIn: number | null;
  /** Lowest heart event not seen yet. */
  nextEvent: (HeartEvent & { unlocked: boolean }) | null;
  /** Every heart event for this NPC, with whether this player has seen it. */
  events: Array<HeartEvent & { seen: boolean }>;
}

export function buildRelationships(save: SaveData, player: Player): Relationship[] {
  const { npcs, heartEvents } = gameData();
  const seen = new Set(player.eventsSeen);
  return Object.entries(player.friendships)
    .filter(([npc]) => npcs[npc]?.gifts && npcs[npc].social !== 3)
    .map(([npc, f]) => {
      const data = npcs[npc];
      const hearts = Math.floor(f.points / POINTS_PER_HEART);
      const married = f.status === 'Married' || f.status === 'Roommate';
      const maxHearts = married ? 14 : data.romance && f.status !== 'Dating' && f.status !== 'Engaged' ? 8 : 10;
      const next = heartEvents.events.find((e) => e.npc === npc && !seen.has(e.id));
      return {
        npc,
        points: f.points,
        hearts,
        maxHearts,
        status: f.status,
        giftsThisWeek: f.giftsThisWeek,
        giftsToday: f.giftsToday,
        birthdayIn: data.birth ? daysUntil(save.date, data.birth) : null,
        nextEvent: next ? { ...next, unlocked: hearts >= next.hearts } : null,
        events: heartEvents.events.filter((e) => e.npc === npc).map((e) => ({ ...e, seen: seen.has(e.id) })),
      };
    })
    .sort((a, b) => b.points - a.points);
}
