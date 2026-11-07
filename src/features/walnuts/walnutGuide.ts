/**
 * How to get each kind of golden walnut, written for this site from the game and the
 * Stardew Valley Wiki (paraphrased). Puzzles with a fixed area can be pinned on the map;
 * the text lives in i18n under walnuts.how.<key>.
 */
export interface WalnutGuide {
  key: string;
  /** Walnuts this source gives in total. */
  total: number;
  /** Area to pin on the map (its center; exact tiles vary). */
  pin?: { location: string };
}

export const ONE_TIME_GUIDE: WalnutGuide[] = [
  { key: 'IslandGourmand1', total: 5, pin: { location: 'IslandWestCave1' } },
  { key: 'IslandGourmand2', total: 5, pin: { location: 'IslandWestCave1' } },
  { key: 'IslandGourmand3', total: 5, pin: { location: 'IslandWestCave1' } },
  { key: 'Mermaid', total: 5, pin: { location: 'IslandSouthEast' } },
  { key: 'TreeNut', total: 1, pin: { location: 'IslandWest' } },
  { key: 'TreeNutShot', total: 1, pin: { location: 'IslandWest' } },
  { key: 'SandDuggy', total: 1, pin: { location: 'IslandWest' } },
  { key: 'IslandWestCavePuzzle', total: 3, pin: { location: 'IslandWest' } },
  { key: 'IslandShrinePuzzle', total: 5, pin: { location: 'IslandEast' } },
  { key: 'BananaShrine', total: 3, pin: { location: 'IslandEast' } },
  { key: 'StardropPool', total: 1, pin: { location: 'IslandNorth' } },
  { key: 'IslandLeftPlantRestored', total: 1 },
  { key: 'IslandRightPlantRestored', total: 1 },
  { key: 'IslandSnakeRestored', total: 3 },
  { key: 'IslandFrogRestored', total: 1 },
  { key: 'IslandBatRestored', total: 1 },
  { key: 'IslandCenterSkeletonRestored', total: 6 },
];
