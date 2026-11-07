/**
 * The game's randomness, bit for bit: .NET's seeded System.Random (Knuth subtractive generator,
 * the "Net5Compat" implementation used for seeded instances) and Stardew's xxHash32-based seeds.
 */

const MBIG = 2147483647;
const MSEED = 161803398;

export class DotNetRandom {
  private seedArray = new Int32Array(56);
  private inext = 0;
  private inextp = 21;

  constructor(seed: number) {
    const s = this.seedArray;
    const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
    let mj = MSEED - subtraction;
    s[55] = mj;
    let mk = 1;
    let ii = 0;
    for (let i = 1; i < 55; i++) {
      ii += 21;
      if (ii >= 55) ii -= 55;
      s[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = s[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        let n = i + 30;
        if (n >= 55) n -= 55;
        s[i] = s[i] - s[1 + n];
        if (s[i] < 0) s[i] += MBIG;
      }
    }
  }

  private internalSample(): number {
    let locINext = this.inext + 1;
    if (locINext >= 56) locINext = 1;
    let locINextp = this.inextp + 1;
    if (locINextp >= 56) locINextp = 1;
    let ret = this.seedArray[locINext] - this.seedArray[locINextp];
    if (ret === MBIG) ret--;
    if (ret < 0) ret += MBIG;
    this.seedArray[locINext] = ret;
    this.inext = locINext;
    this.inextp = locINextp;
    return ret;
  }

  private sample(): number {
    return this.internalSample() * (1 / MBIG);
  }

  private largeRangeSample(): number {
    let result = this.internalSample();
    if (this.internalSample() % 2 === 0) result = -result;
    return (result + (MBIG - 1)) / (2 * MBIG - 1);
  }

  /** Random.Next(), Random.Next(max) and Random.Next(min, max). */
  next(a?: number, b?: number): number {
    if (a === undefined) return this.internalSample();
    if (b === undefined) return Math.trunc(this.sample() * a);
    const range = b - a;
    if (range <= MBIG) return Math.trunc(this.sample() * range) + a;
    return Math.trunc(this.largeRangeSample() * range) + a;
  }

  nextDouble(): number {
    return this.sample();
  }

  /** RandomExtensions.ChooseFrom. */
  chooseFrom<T>(options: readonly T[]): T | undefined {
    return options.length ? options[this.next(options.length)] : undefined;
  }

  /** RandomExtensions.NextBool(chance). */
  nextBool(chance: number): boolean {
    return chance >= 1 || this.nextDouble() < chance;
  }
}

/** xxHash32 with seed 0, as used by StardewValley.Hashing.HashUtility. Returns a signed int. */
export function xxHash32(bytes: Uint8Array): number {
  const P1 = 0x9e3779b1;
  const P2 = 0x85ebca77;
  const P3 = 0xc2b2ae3d;
  const P4 = 0x27d4eb2f;
  const P5 = 0x165667b1;
  const rotl = (x: number, r: number) => (x << r) | (x >>> (32 - r));
  const u32 = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
  const round = (acc: number, input: number) => Math.imul(rotl((acc + Math.imul(input, P2)) | 0, 13), P1);

  const len = bytes.length;
  let i = 0;
  let h: number;
  if (len >= 16) {
    let v1 = (P1 + P2) | 0;
    let v2 = P2;
    let v3 = 0;
    let v4 = -P1 | 0;
    for (; i <= len - 16; i += 16) {
      v1 = round(v1, u32(i));
      v2 = round(v2, u32(i + 4));
      v3 = round(v3, u32(i + 8));
      v4 = round(v4, u32(i + 12));
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) | 0;
  } else {
    h = P5;
  }
  h = (h + len) | 0;
  for (; i <= len - 4; i += 4) h = Math.imul(rotl((h + Math.imul(u32(i), P3)) | 0, 17), P4);
  for (; i < len; i++) h = Math.imul(rotl((h + Math.imul(bytes[i], P5)) | 0, 11), P1);
  h ^= h >>> 15;
  h = Math.imul(h, P2);
  h ^= h >>> 13;
  h = Math.imul(h, P3);
  h ^= h >>> 16;
  return h | 0;
}

const encoder = new TextEncoder();

/** Game1.hash.GetDeterministicHashCode(string). */
export const hashString = (value: string) => xxHash32(encoder.encode(value));

/** Game1.hash.GetDeterministicHashCode(params int[]). */
export function hashInts(...values: number[]): number {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setInt32(i * 4, v | 0, true));
  return xxHash32(bytes);
}

/** C# (int)(double % 2147483647.0): truncation toward zero, wrapping like an int cast in range. */
const seedPart = (v: number) => Math.trunc(v % 2147483647);

/** Utility.CreateRandomSeed. */
export function createRandomSeed(a: number, b: number, c = 0, d = 0, e = 0, legacy = false): number {
  if (legacy) return Math.trunc((seedPart(a) + seedPart(b) + seedPart(c) + seedPart(d) + seedPart(e)) % 2147483647);
  return hashInts(seedPart(a), seedPart(b), seedPart(c), seedPart(d), seedPart(e));
}

/** The values the game seeds day randoms from. */
export interface SeedContext {
  daysPlayed: number;
  /** uniqueIDForThisGame (a ulong; precise enough as a double for real saves). */
  gameId: number;
  legacyRandom: boolean;
  season: string;
  year: number;
}

/** Utility.CreateDaySaveRandom. */
export function createDaySaveRandom(ctx: SeedContext, a = 0, b = 0, c = 0): DotNetRandom {
  return new DotNetRandom(createRandomSeed(ctx.daysPlayed, Math.floor(ctx.gameId / 2), a, b, c, ctx.legacyRandom));
}

/** Utility.TryCreateIntervalRandom, used by SYNCED_RANDOM and SYNCED_CHOICE. */
export function createIntervalRandom(ctx: SeedContext, interval: string, key: string | null): DotNetRandom | null {
  const k = key != null ? hashString(key) : 0;
  let c: number;
  switch (interval.toLowerCase()) {
    case 'day':
      c = ctx.daysPlayed;
      break;
    case 'season':
      c = hashString(ctx.season + ctx.year);
      break;
    case 'year':
      c = hashString('year' + ctx.year);
      break;
    default:
      return null; // "tick" changes every frame
  }
  return new DotNetRandom(createRandomSeed(k, ctx.gameId, c, 0, 0, ctx.legacyRandom));
}
