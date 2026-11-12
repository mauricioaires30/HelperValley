import { describe, expect, it } from 'vitest';
import { APP_LIVE_MS, isAppLive, parseAppStatus } from '../appStatus';

const now = 1_800_000_000_000;
const file = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, running: true, enabled: true, at: now - 5_000, lastCopyAt: now - 60_000, state: 'ok', appVersion: '0.1.0', ...over });

describe('app status', () => {
  it('reads the status file', () => {
    expect(parseAppStatus(file())).toMatchObject({ running: true, enabled: true, state: 'ok', appVersion: '0.1.0' });
    expect(parseAppStatus('not json')).toBeNull();
    expect(parseAppStatus('{"hello":1}')).toBeNull();
  });

  it('is live while the app writes recently', () => {
    expect(isAppLive(parseAppStatus(file()), now - 5_000, now)).toBe(true);
  });

  it('is not live once the app quit, is switched off or has a problem', () => {
    expect(isAppLive(parseAppStatus(file({ running: false })), now, now)).toBe(false);
    expect(isAppLive(parseAppStatus(file({ enabled: false })), now, now)).toBe(false);
    expect(isAppLive(parseAppStatus(file({ state: 'legacy-setup' })), now, now)).toBe(false);
    expect(isAppLive(null, now, now)).toBe(false);
  });

  it('stops being live when the file goes stale, as when the PC sleeps or the app crashes', () => {
    const old = now - APP_LIVE_MS - 1;
    expect(isAppLive(parseAppStatus(file({ at: old })), old, now)).toBe(false);
    // The file's own time counts too, in case the clock in the file is behind.
    expect(isAppLive(parseAppStatus(file({ at: old })), now - 1_000, now)).toBe(true);
  });
});
