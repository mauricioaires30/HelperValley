import { describe, expect, it } from 'vitest';
import { DotNetRandom, hashInts, hashString } from '../random';

// Expected values come from the game's own System.Data.HashFunction.xxHash and .NET 8 System.Random.
describe('hash', () => {
  it('matches HashUtility for strings', () => {
    expect(hashString('')).toBe(46947589);
    expect(hashString('cart_fez')).toBe(-527134828);
    expect(hashString('summer3')).toBe(1374297255);
  });

  it('matches HashUtility for int seeds', () => {
    expect(hashInts(100, 185667320, 0, 0, 0)).toBe(-767284458);
    expect(hashInts(-5, 7, 123456789, 0, 1)).toBe(-787717193);
  });
});

describe('System.Random', () => {
  const cases: Array<[number, number[], number, number, number, number, number]> = [
    [0, [1559595546, 1755192844, 1649316166, 1198642031], 2, 6, 0.9060270660119257, 442177315, 2099272108],
    [12345, [143337951, 150666398, 1663795458, 1097663221], 7, 7, 0.16595879530811627, 736130359, 558810387],
    [-98765, [134001175, 659474279, 680542309, 535153919], 1, 3, 0.2257643883236518, 302221191, -1841394533],
    [2147483647, [1559595546, 1755192844, 1649316172, 1198642031], 2, 6, 0.9060270660119257, 442177315, 2099272108],
    [-2147483648, [1559595546, 1755192844, 1649316172, 1198642031], 2, 6, 0.9060270660119257, 442177315, 2099272108],
  ];
  for (const [seed, nexts, n10, n39, dbl, big, huge] of cases) {
    it(`matches seed ${seed}`, () => {
      const r = new DotNetRandom(seed);
      expect(nexts.map(() => r.next())).toEqual(nexts);
      expect(r.next(10)).toBe(n10);
      expect(r.next(3, 9)).toBe(n39);
      expect(r.nextDouble()).toBe(dbl);
      expect(r.next(-1000, 1000000000)).toBe(big);
      expect(r.next(-2147483648, 2147483647)).toBe(huge);
    });
  }
});
