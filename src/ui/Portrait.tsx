import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { Sprite } from './Sprite';

/** Texture name for an NPC (Leo uses "ParrotBoy", Mister Qi "MrQi"...). */
const textureOf = (npc: string) => gameData().npcs[npc]?.tex ?? npc;

/** First (neutral) 64x64 portrait frame of a villager. */
export function Portrait({ npc, scale = 1 }: { npc: string; scale?: number }) {
  const name = useGameName();
  const sheet = `Portraits/${textureOf(npc)}`;
  if (!gameData().sheets[sheet]) return null;
  return <Sprite sheet={sheet} x={0} y={0} w={64} h={64} scale={scale} label={name(gameData().npcs[npc]?.n)} />;
}

/** Overworld sprite (first frame, facing down) of a villager. */
export function NpcSprite({ npc, scale = 2 }: { npc: string; scale?: number }) {
  const sheet = `Characters/${textureOf(npc)}`;
  const [w, h] = gameData().npcs[npc]?.size ?? [16, 32];
  if (!gameData().sheets[sheet]) return null;
  return <Sprite sheet={sheet} x={0} y={0} w={w} h={h} scale={scale} />;
}

/** Head of a villager's overworld sprite, starting at its first visible row. */
export function NpcHead({ npc, scale = 2 }: { npc: string; scale?: number }) {
  const name = useGameName();
  const data = gameData().npcs[npc];
  const sheet = `Characters/${textureOf(npc)}`;
  if (!gameData().sheets[sheet]) return null;
  const [w, h] = data?.size ?? [16, 32];
  const top = Math.min(data?.head ?? 2, h - 15);
  return <Sprite sheet={sheet} x={0} y={top} w={w} h={15} scale={scale} label={name(data?.n)} />;
}
