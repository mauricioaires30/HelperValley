import type { CSSProperties } from 'react';
import { gameData, spriteUrl } from '@/data/gameData';

interface SpriteProps {
  /** Sheet asset, e.g. "Maps/springobjects". */
  sheet: string;
  /** Source rect in sheet pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Integer upscale; defaults to the global 2x. */
  scale?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Multiplies the sprite by this color, like the game's draw color. */
  tint?: [number, number, number];
}

/** Draws a rect of a game sprite sheet at an integer scale. */
export function Sprite({ sheet, x, y, w, h, scale = 2, label, className, style, tint }: SpriteProps) {
  const [sheetW, sheetH] = gameData().sheets[sheet] ?? [w, h];
  const url = `url("${encodeURI(spriteUrl(sheet))}")`;
  const position = `${-x * scale}px ${-y * scale}px`;
  const size = `${sheetW * scale}px ${sheetH * scale}px`;
  // Multiply blend with a solid color, then mask by the same sprite so the color stays inside it.
  const tinted: CSSProperties | undefined = tint && {
    backgroundColor: `rgb(${tint.join(' ')})`,
    backgroundBlendMode: 'multiply',
    maskImage: url,
    maskPosition: position,
    maskSize: size,
    maskRepeat: 'no-repeat',
  };
  return (
    <span
      className={className ? `sprite ${className}` : 'sprite'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: w * scale,
        height: h * scale,
        backgroundImage: url,
        backgroundPosition: position,
        backgroundSize: size,
        ...tinted,
        ...style,
      }}
    />
  );
}

/** Source rect of the n-th tile in a sheet laid out as a grid of `w`x`h` cells. */
export function gridRect(sheet: string, index: number, w: number, h: number) {
  const [sheetW] = gameData().sheets[sheet] ?? [w];
  const columns = Math.max(1, Math.floor(sheetW / w));
  return { x: (index % columns) * w, y: Math.floor(index / columns) * h };
}

/** A UI crop from public/sprites/ui (see tools/extract/lib/ui.mjs). */
export function UiIcon({ name, w, h, scale = 2, label }: { name: string; w: number; h: number; scale?: number; label?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}sprites/ui/${name}.png`}
      width={w * scale}
      height={h * scale}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className="sprite"
      draggable={false}
    />
  );
}
