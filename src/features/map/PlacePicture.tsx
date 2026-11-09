import { assetUrl, gameData } from '@/data/gameData';

/** Location names that differ between the map's pins and the game's warps. */
const ALIASES: Record<string, string> = { Mines: 'Mine', UndergroundMine: 'Mine', SandyShop: 'SandyHouse' };

/** The picture for a place, only when it's a specific spot: the exact tile or a building's door. */
export function placePictureKey(location: string, tile?: readonly [number, number]): string | null {
  const { spots, doors } = gameData().places;
  const exact = tile && `${location}_${tile[0]}_${tile[1]}`;
  if (exact && spots.includes(exact)) return exact;
  return doors[ALIASES[location] ?? location] ?? null;
}

/** What the spot looks like in the game, for a pin's hover card. */
export function PlacePicture({ location, tile }: { location: string; tile?: readonly [number, number] }) {
  const key = placePictureKey(location, tile);
  if (!key) return null;
  return <img className="place-picture" src={assetUrl(`places/${key}.png?v=${__BUILD_ID__}`)} alt="" width={336} height={216} />;
}
