import { XMLParser } from 'fast-xml-parser';

/** A parsed XML element: child elements by tag, attributes as "@_name", text as "#text". */
export type XmlNode = { [key: string]: XmlValue };
export type XmlValue = string | XmlNode | XmlValue[] | undefined;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Keep every value as a string; ids like "24" vs "Book_Void" must not be coerced.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export function parseXml(xml: string): XmlNode {
  return parser.parse(xml) as XmlNode;
}

/** Child elements as an array (XML lists with a single entry parse as a plain value). */
export function arr(value: XmlValue): XmlValue[] {
  if (value === undefined || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

export function node(value: XmlValue): XmlNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

/** Text of a leaf element, handling elements that carry attributes. */
export function text(value: XmlValue): string | undefined {
  if (typeof value === 'string') return value;
  const n = node(value);
  if (n && typeof n['#text'] === 'string') return n['#text'];
  return undefined;
}

export function num(value: XmlValue, fallback = 0): number {
  const t = text(value);
  if (t === undefined || t === '') return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(value: XmlValue): boolean {
  return text(value) === 'true';
}

/** xsi:type of a polymorphic element, e.g. "Chest" or "Farm". */
export function xsiType(value: XmlValue): string | undefined {
  return text(node(value)?.['@_xsi:type']);
}

/** Single typed child like <value><int>5</int></value> → the inner value. */
export function inner(value: XmlValue): XmlValue {
  const n = node(value);
  if (!n) return value;
  const keys = Object.keys(n).filter((k) => !k.startsWith('@_'));
  return keys.length === 1 ? n[keys[0]] : value;
}

/** Strings of a <list><string>a</string><string>b</string></list> element. */
export function strings(value: XmlValue, tag = 'string'): string[] {
  return arr(node(value)?.[tag]).map((v) => text(v) ?? '');
}

export function numbers(value: XmlValue, tag = 'int'): number[] {
  return arr(node(value)?.[tag]).map((v) => num(v));
}

/**
 * Entries of a SerializableDictionary:
 * <dict><item><key><string>k</string></key><value><int>1</int></value></item></dict>
 */
export function dictEntries(value: XmlValue): Array<[XmlValue, XmlValue]> {
  return arr(node(value)?.item).map((item) => {
    const n = node(item);
    return [inner(n?.key), inner(n?.value)];
  });
}

/** Dictionary with string keys mapped through `map`. */
export function dict<T>(value: XmlValue, map: (v: XmlValue) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of dictEntries(value)) {
    const key = text(k);
    if (key !== undefined) out[key] = map(v);
  }
  return out;
}
