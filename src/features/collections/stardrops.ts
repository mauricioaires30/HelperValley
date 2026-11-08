/** The seven Stardrops: the mail flag marking each one, and where to go for those found at a place. */
export const STARDROPS: Array<{ id: string; flag: string; place?: { location: string; tile?: [number, number] } }> = [
  { id: 'fair', flag: 'CF_Fair', place: { location: 'Town', tile: [43, 62] } },
  { id: 'mines', flag: 'CF_Mines', place: { location: 'Mines' } },
  { id: 'krobus', flag: 'CF_Sewer', place: { location: 'Sewer' } },
  { id: 'museum', flag: 'museumComplete', place: { location: 'ArchaeologyHouse' } },
  { id: 'cannoli', flag: 'CF_Statue', place: { location: 'Woods' } },
  { id: 'fishing', flag: 'CF_Fish' },
  { id: 'spouse', flag: 'CF_Spouse' },
];

export const STARDROP_ITEM = '(O)434';
