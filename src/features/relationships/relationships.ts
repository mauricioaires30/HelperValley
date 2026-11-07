import { gameData, type HeartEvent } from '@/data/gameData';
import type { Player, SaveData } from '@/save/model';
import { daysUntil } from '@/features/calendar/calendar';

export const POINTS_PER_HEART = 250;

/** Events that need marriage to this NPC ("O npc") or more than 10 hearts (spouse only). */
const requiresMarriage = (e: HeartEvent, npc: string) => e.hearts > 10 || e.conditions.some(([c, who]) => c === 'O' && who === npc);

export interface Relationship {
  npc: string;
  points: number;
  hearts: number;
  /** Hearts reachable now: 8 for unwed romanceables, 14 for a spouse, else 10. */
  maxHearts: number;
  /** Hearts drawn: 14 for anyone you could marry (locked ones dark), 10 otherwise. */
  shownHearts: number;
  /** Married to someone else: romance-only events can't happen. */
  marriedElsewhere: boolean;
  status: string;
  giftsThisWeek: number;
  giftsToday: number;
  /** Days until the NPC's birthday (0 = today). */
  birthdayIn: number | null;
  /** Lowest heart event not seen yet. */
  nextEvent: (HeartEvent & { unlocked: boolean }) | null;
  /** Every heart event for this NPC, with whether this player has seen it. */
  events: Array<HeartEvent & { seen: boolean; impossible: boolean }>;
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
      const marriedElsewhere = !!player.spouse && player.spouse !== npc;
      const next = heartEvents.events.find((e) => e.npc === npc && !seen.has(e.id) && !(marriedElsewhere && requiresMarriage(e, npc)));
      return {
        npc,
        points: f.points,
        hearts,
        maxHearts,
        shownHearts: data.romance ? 14 : 10,
        marriedElsewhere: !!player.spouse && player.spouse !== npc,
        status: f.status,
        giftsThisWeek: f.giftsThisWeek,
        giftsToday: f.giftsToday,
        birthdayIn: data.birth ? daysUntil(save.date, data.birth) : null,
        nextEvent: next ? { ...next, unlocked: hearts >= next.hearts } : null,
        events: heartEvents.events
          .filter((e) => e.npc === npc)
          .map((e) => ({ ...e, seen: seen.has(e.id), impossible: !seen.has(e.id) && marriedElsewhere && requiresMarriage(e, npc) })),
      };
    })
    .sort((a, b) => b.points - a.points);
}
