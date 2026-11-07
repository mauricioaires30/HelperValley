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

/**
 * Top-level keys of a dumped dictionary in file order. JSON.parse moves integer-like keys
 * ("0", "128") to the front in numeric order, but the game iterates its dictionaries in data order.
 */
export function readRawKeys(asset) {
  const file = path.join(CACHE_DIR, asset.replace(/\\/g, '/') + '.json');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const keys = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (depth === 1) {
        let k = j + 1;
        while (/\s/.test(text[k])) k++;
        if (text[k] === ':') keys.push(JSON.parse(text.slice(i, j + 1)));
      }
      i = j;
    } else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return keys;
}
