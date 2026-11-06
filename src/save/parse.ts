import type { SaveData } from './model';
import type { ParseRequest, ParseResponse } from './parser.worker';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (d: SaveData) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<ParseResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if ('error' in event.data) request.reject(new Error(event.data.error));
    else request.resolve(event.data.data);
  };
  return worker;
}

/** Parses a save off the main thread. */
export function parseSave(xml: string, folder: string): Promise<SaveData> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, xml, folder } satisfies ParseRequest);
  });
}
