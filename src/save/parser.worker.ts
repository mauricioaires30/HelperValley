/// <reference lib="webworker" />
import { normalizeSave } from './normalize';
import type { SaveData } from './model';

export type ParseRequest = { id: number; xml: string; folder: string };
export type ParseResponse = { id: number; data: SaveData } | { id: number; error: string };

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, xml, folder } = event.data;
  try {
    const data = normalizeSave(xml, folder);
    self.postMessage({ id, data } satisfies ParseResponse);
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies ParseResponse);
  }
};
