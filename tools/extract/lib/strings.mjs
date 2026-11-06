import { readLocalized } from './raw.mjs';
import { LANGUAGES } from './paths.mjs';

const TOKEN = /\[LocalizedText\s+([^\]:\s]+):([^\]\s]+)((?:\s+[^\]\s]+)*)\]/g;

/** Looks up "Strings\Objects:Key" in the given language suffix. */
export function lookup(assetKey, suffix) {
  const [asset, key] = assetKey.split(':');
  const table = readLocalized(asset.replace(/\\/g, '/'), suffix);
  return table?.[key] ?? readLocalized(asset.replace(/\\/g, '/'), '')?.[key] ?? null;
}

/** Resolves game text tokens such as "[LocalizedText Strings\Objects:Weeds_Name]". */
export function resolveText(text, suffix) {
  if (text == null) return null;
  return text
    .replace(TOKEN, (_, asset, key, args) => {
      let value = lookup(`${asset}:${key}`, suffix) ?? key;
      args
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .forEach((arg, i) => (value = value.replace(`{${i}}`, arg)));
      return value;
    })
    .trim();
}

/** Resolves a text token in every exported language, returning [en, pt, ...]. */
export function localize(text, fallback) {
  return LANGUAGES.map(([, suffix]) => resolveText(text, suffix) || fallback || '');
}
