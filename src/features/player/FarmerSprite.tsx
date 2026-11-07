import { useEffect, useRef } from 'react';
import { gameData, spriteUrl } from '@/data/gameData';
import type { PlayerLook } from '@/save/model';

/**
 * Draws the farmer facing down, standing still, the way FarmerRenderer does:
 * recolored base (skin, eyes, shoes, sleeves), pants, shirt + dye layer, accessory, hair, hat, arms.
 * Everything is composed at the game's 4x zoom so sub-pixel hat offsets land where they do in game.
 */

type Rgba = [number, number, number, number];
interface Sheet {
  w: number;
  h: number;
  px: Uint8ClampedArray;
}

const FARMER = 'Characters/Farmer/';
/** Frame 0 (standing, facing down): FarmerRenderer.featureYOffsetPerFrame[0]. */
const FEATURE_Y = 1;
/** FarmerRenderer.hairstyleHatOffset, in screen pixels at 4x. */
const HAT_OFFSET = [0, 0, 0, 4, 0, 0, 3, 0, 4, 0, 0, 0, 0, 0, 0, 0];
/** Canvas covers x -8..72 and y -8..128 (screen px at 4x) so hats fit. */
const PAD = 8;
const W = 80;
const H = 136;

const sheets = new Map<string, Promise<Sheet>>();
function loadSheet(asset: string): Promise<Sheet> {
  let p = sheets.get(asset);
  if (!p) {
    p = new Promise<Sheet>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve({ w: img.width, h: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data });
      };
      img.onerror = reject;
      img.src = encodeURI(spriteUrl(asset));
    });
    sheets.set(asset, p);
  }
  return p;
}

const hex = (h: string | null | undefined): Rgba => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h ?? '');
  if (!m) return [255, 255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const at = (s: Sheet, i: number): Rgba => [s.px[i * 4], s.px[i * 4 + 1], s.px[i * 4 + 2], s.px[i * 4 + 3]];
const mul = (a: Rgba, b: Rgba): Rgba => [(a[0] * b[0]) / 255, (a[1] * b[1]) / 255, (a[2] * b[2]) / 255, a[3]];
/** FarmerRenderer.changeBrightness. */
const darker = (c: Rgba, by: number): Rgba => [
  Math.max(0, c[0] + by),
  Math.max(0, c[1] + by),
  Math.max(0, c[2] + (by > 0 ? Math.trunc((by * 5) / 6) : Math.trunc((by * 8) / 7))),
  c[3],
];

/** Copies a rect of a sheet into a small canvas, optionally multiplied by a tint. */
function crop(s: Sheet, x: number, y: number, w: number, h: number, tint?: Rgba, flip = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const out = new ImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      const sy = y + j;
      if (sx < 0 || sy < 0 || sx >= s.w || sy >= s.h) continue;
      let px = at(s, sy * s.w + sx);
      if (tint) px = mul(px, tint);
      const o = (j * w + (flip ? w - 1 - i : i)) * 4;
      out.data.set(px, o);
    }
  }
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c;
}

/** Swaps the base texture's palette keys (row 0, x 256-277) for the farmer's colors. */
function recolorBase(base: Sheet, swaps: Array<[number, Rgba]>): Sheet {
  const px = new Uint8ClampedArray(base.px);
  for (const [key, color] of swaps) {
    const k = at(base, key);
    for (let i = 0; i < base.w * base.h; i++) {
      if (base.px[i * 4] === k[0] && base.px[i * 4 + 1] === k[1] && base.px[i * 4 + 2] === k[2] && base.px[i * 4 + 3] === k[3]) {
        px.set(color, i * 4);
      }
    }
  }
  return { ...base, px };
}

/** Farmer.getHair: hats that hide or squash the hair swap the style. */
function displayedHair(hair: number, hatDraw: number | undefined): number {
  if (hatDraw === 2) return -1;
  if (hatDraw !== 1) return hair;
  if ((hair >= 50 && hair <= 55) || [1, 5, 6, 9, 11, 17, 20, 23, 24, 25, 27, 28, 29, 30, 32, 33, 34, 36, 39, 41, 43, 44, 45, 46, 47].includes(hair)) return hair;
  const map: Record<number, number> = { 48: 6, 49: 52, 3: 11, 18: 23, 19: 23, 21: 23, 31: 23, 42: 46 };
  if (map[hair] !== undefined) return map[hair];
  if (hair >= 16) return hair < 100 ? 30 : hair;
  return 7;
}

const isFacialHair = (a: number) => (a >= 6 ? a >= 19 && a <= 22 : true);

/** Composes the farmer off-screen; the caller copies it once every sheet has loaded. */
async function compose(look: PlayerLook): Promise<HTMLCanvasElement> {
  const data = gameData().player.look;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const put = (layer: HTMLCanvasElement, x: number, y: number) => ctx.drawImage(layer, x + PAD, y + PAD, layer.width * 4, layer.height * 4);
  const heightOffset = look.male ? 0 : 4;

  const shirtData = look.shirt ? data.shirts[look.shirt.id] : undefined;
  const shirtSheet = await loadSheet(shirtData?.[0] ?? FARMER + 'shirts');
  const shirtIndex = look.shirt ? look.shirt.index : look.male ? 209 : 41;
  const shirtColor = hex(look.shirt?.color ?? '#ffffff');
  const hasSleeves = shirtData?.[2] ?? true;

  const pantsData = look.pants ? data.pants[look.pants.id] : undefined;
  const pantsSheet = await loadSheet(pantsData?.[0] ?? FARMER + 'pants');
  const pantsIndex = look.pants ? look.pants.index : 14;
  const pantsColor = hex(look.pants?.color ?? '#ffffff');

  const [rawBase, skins, shoes] = await Promise.all([
    loadSheet(FARMER + (look.male ? 'farmer_base' : 'farmer_girl_base')),
    loadSheet(FARMER + 'skinColors'),
    loadSheet(FARMER + 'shoeColors'),
  ]);

  // Palette swaps (FarmerRenderer.Apply*Color).
  const skinRow = look.skin < 0 ? skins.h - 1 : look.skin > skins.h - 1 ? 0 : look.skin;
  const skin = [0, 1, 2].map((i) => at(skins, skinRow * 3 + i));
  const shoeRow = Math.min(look.shoeColor, shoes.h - 1);
  const shoe = [0, 1, 2, 3].map((i) => at(shoes, shoeRow * 4 + i));
  let eye = hex(look.eyeColor);
  const eyeDark = darker(eye, -75);
  if (eye.join() === eyeDark.join()) eye = [eye[0], eye[1], eye[2] + 10, 255];

  let sleeves = skin;
  const sleeveAt = Math.floor((shirtIndex * 8) / 128) * 32 * shirtSheet.w + ((shirtIndex * 8) % 128) + shirtSheet.w * 4;
  if (hasSleeves && sleeveAt < shirtSheet.w * shirtSheet.h) {
    sleeves = [0, 1, 2].map((row) => {
      let a = at(shirtSheet, sleeveAt + 128 - row * shirtSheet.w);
      let b = shirtColor;
      if (a[3] < 255) {
        a = at(shirtSheet, sleeveAt - row * shirtSheet.w);
        b = [255, 255, 255, 255];
      }
      return mul(a, b);
    });
  }
  const base = recolorBase(rawBase, [
    [256, sleeves[0]],
    [257, sleeves[1]],
    [258, sleeves[2]],
    [260, skin[0]],
    [261, skin[1]],
    [262, skin[2]],
    [268, shoe[0]],
    [269, shoe[1]],
    [270, shoe[2]],
    [271, shoe[3]],
    [276, eye],
    [277, eyeDark],
  ]);

  // Base body, then pants.
  put(crop(base, 0, 0, 16, 32), 0, 0);
  const px = (pantsIndex % 10) * 192 + (look.male ? 0 : 96);
  const py = Math.floor(pantsIndex / 10) * 688;
  put(crop(pantsSheet, px, py, 16, 32, pantsColor), 0, 0);

  // Shirt and its dye layer.
  const sx = (shirtIndex * 8) % 128;
  const sy = Math.floor((shirtIndex * 8) / 128) * 32;
  const shirtY = 56 + FEATURE_Y * 4 + heightOffset;
  put(crop(shirtSheet, sx, sy, 8, 8), 16, shirtY);
  put(crop(shirtSheet, sx + 128, sy, 8, 8, shirtColor), 16, shirtY);

  const hat = look.hat ? data.hats[look.hat] : undefined;
  const hairColor = hex(look.hairColor);
  const hairId = displayedHair(look.hair, hat?.[0]);

  // Accessory: beards and glasses below the hair, the rest above.
  const accessory = async () => {
    if (look.accessory < 0) return;
    const acc = await loadSheet(FARMER + 'accessories');
    const ax = (look.accessory * 16) % acc.w;
    const ay = Math.floor((look.accessory * 16) / acc.w) * 32;
    put(crop(acc, ax, ay, 16, 16, isFacialHair(look.accessory) ? hairColor : undefined), 0, 8 + FEATURE_Y * 4 + heightOffset - 4);
  };
  const below = look.accessory >= 0 && (look.accessory < 8 || isFacialHair(look.accessory));
  if (below) await accessory();

  if (hairId >= 0) {
    const meta = data.hair[hairId];
    const hairSheet = await loadSheet(meta ? meta[0] : FARMER + 'hairstyles');
    const hx = meta ? meta[1] * 16 : (hairId * 16) % hairSheet.w;
    const hy = meta ? meta[2] * 16 : Math.floor((hairId * 16) / hairSheet.w) * 96;
    const shift = look.male && hairId >= 16 ? -4 : !look.male && hairId < 16 ? 4 : 0;
    put(crop(hairSheet, hx, hy, 16, 32, hairColor), 0, FEATURE_Y * 4 + shift);
  }
  if (!below) await accessory();

  if (hat && look.hat) {
    const hats = await loadSheet(hat[2] ?? FARMER + 'hats');
    const idx = hat[3];
    const offset = hat[1] ? 0 : HAT_OFFSET[look.hair % 16];
    put(crop(hats, (20 * idx) % hats.w, Math.floor((20 * idx) / hats.w) * 80, 20, 20), -8, -16 + FEATURE_Y * 4 + offset + 4 + heightOffset);
  }

  // Arms (armOffset 6 for a standing frame).
  put(crop(base, 96, 0, 16, 32), 0, 0);
  return canvas;
}

export function FarmerSprite({ look, scale = 1, label }: { look: PlayerLook; scale?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stale = false;
    void compose(look).then((image) => {
      const ctx = ref.current?.getContext('2d');
      if (stale || !ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(image, 0, 0);
    });
    return () => {
      stale = true;
    };
  }, [look]);
  return <canvas ref={ref} width={W} height={H} className="farmer-sprite" role="img" aria-label={label} style={{ width: W * scale, height: H * scale }} />;
}
