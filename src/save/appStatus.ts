/**
 * The HelperValley desktop app copies the game's saves into a folder the browser may read, and every
 * 15 s writes this status file there. The site reads it with the saves, so it knows the app is running
 * without any local server or network permission.
 */
export const APP_STATUS_FILE = '.helpervalley-app.json';

/** Without a fresh write for this long, the app is taken as closed (it writes every 15 s). */
export const APP_LIVE_MS = 35_000;

export interface AppStatus {
  v: number;
  /** False once the app quits. */
  running: boolean;
  /** The copy switched on in the app. */
  enabled: boolean;
  /** When the app wrote this file (ms). */
  at: number;
  lastCopyAt: number | null;
  state: 'ok' | 'paused' | 'source-missing' | 'legacy-setup' | 'error';
  appVersion: string;
}

/** The status file's contents, or null when it isn't one. */
export function parseAppStatus(text: string): AppStatus | null {
  try {
    const value = JSON.parse(text) as Partial<AppStatus>;
    if (typeof value !== 'object' || value === null || typeof value.at !== 'number' || typeof value.running !== 'boolean') return null;
    return {
      v: Number(value.v ?? 1),
      running: value.running,
      enabled: value.enabled !== false,
      at: value.at,
      lastCopyAt: typeof value.lastCopyAt === 'number' ? value.lastCopyAt : null,
      state: (['ok', 'paused', 'source-missing', 'legacy-setup', 'error'] as const).includes(value.state as AppStatus['state']) ? (value.state as AppStatus['state']) : 'error',
      appVersion: String(value.appVersion ?? ''),
    };
  } catch {
    return null;
  }
}

/** The app is open and copying: running, switched on, healthy and written recently. */
export function isAppLive(status: AppStatus | null, fileModified: number, now: number): boolean {
  if (!status || !status.running || !status.enabled || status.state !== 'ok') return false;
  return now - Math.max(status.at, fileModified) < APP_LIVE_MS;
}
