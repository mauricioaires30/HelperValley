import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestGameData } from '@/test/gameData';
import { giftTaste } from '../gifts';

beforeAll(loadTestGameData);

describe('giftTaste', () => {
  it('uses personal tastes first', () => {
    expect(giftTaste('Abigail', '66')).toBe('love'); // Amethyst
    expect(giftTaste('Abigail', '(O)330')).toBe('hate'); // Clay
  });

  it('falls back to universal tastes', () => {
    expect(giftTaste('Abigail', '446')).toBe('love'); // Rabbit's Foot
    expect(giftTaste('Lewis', '(O)92')).toBe('hate'); // Sap
  });

  it('uses categories when no id matches', () => {
    // Abigail dislikes -5 (eggs) per her personal list.
    expect(giftTaste('Abigail', '176')).toBe('dislike'); // Egg
  });
});
