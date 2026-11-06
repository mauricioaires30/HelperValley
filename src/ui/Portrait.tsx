import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { Sprite } from './Sprite';

/** First (neutral) 64x64 portrait frame of a villager. */
export function Portrait({ npc, scale = 1 }: { npc: string; scale?: number }) {
  const name = useGameName();
  const sheet = `Portraits/${npc}`;
  if (!gameData().sheets[sheet]) return null;
  return <Sprite sheet={sheet} x={0} y={0} w={64} h={64} scale={scale} label={name(gameData().npcs[npc]?.n)} />;
}

/** Overworld sprite (first frame, facing down) of a villager. */
export function NpcSprite({ npc, scale = 2 }: { npc: string; scale?: number }) {
  const sheet = `Characters/${npc}`;
  if (!gameData().sheets[sheet]) return null;
  return <Sprite sheet={sheet} x={0} y={0} w={16} h={32} scale={scale} />;
}

/** Head of a villager's overworld sprite: a compact icon for lists and calendars. */
export function NpcHead({ npc, scale = 2 }: { npc: string; scale?: number }) {
  const name = useGameName();
  const sheet = `Characters/${npc}`;
  if (!gameData().sheets[sheet]) return null;
  return <Sprite sheet={sheet} x={0} y={2} w={16} h={15} scale={scale} label={name(gameData().npcs[npc]?.n)} />;
}
