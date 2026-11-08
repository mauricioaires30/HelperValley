/** Clint's tool upgrades: the same price and bars for every tool (ShopBuilder.GetToolUpgradeConventionalPrice). */
export const TOOL_UPGRADES: Array<{ level: 'copper' | 'steel' | 'gold' | 'iridium'; price: number; bar: string }> = [
  { level: 'copper', price: 2000, bar: '(O)334' },
  { level: 'steel', price: 5000, bar: '(O)335' },
  { level: 'gold', price: 10000, bar: '(O)336' },
  { level: 'iridium', price: 25000, bar: '(O)337' },
];
