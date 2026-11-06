import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './paths.mjs';

const cache = new Map();

/** Reads a dumped asset (e.g. "Data/Objects" or "Strings/Objects.pt-BR"), or null if missing. */
export function readRaw(asset) {
  if (cache.has(asset)) return cache.get(asset);
  const file = path.join(CACHE_DIR, asset.replace(/\\/g, '/') + '.json');
  const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  cache.set(asset, value);
  return value;
}

/** Reads a dumped asset in a given language suffix, falling back to the English file. */
export function readLocalized(asset, suffix) {
  return (suffix && readRaw(asset + suffix)) || readRaw(asset);
}
