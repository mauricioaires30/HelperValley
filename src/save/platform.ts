/** The visitor's desktop OS, to show the right saves folder and setup steps. */
export type Platform = 'windows' | 'mac' | 'linux';

/** Where Stardew Valley keeps its saves on each OS (Steam and GOG alike). */
export const SAVES_PATH: Record<Platform, string> = {
  windows: '%AppData%\\StardewValley\\Saves',
  mac: '~/.config/StardewValley/Saves',
  linux: '~/.config/StardewValley/Saves',
};

/** Steam installed as a Flatpak keeps its own home folder. */
export const LINUX_FLATPAK_PATH = '~/.var/app/com.valvesoftware.Steam/.config/StardewValley/Saves';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'windows';
  // `?platform=mac|linux|windows` overrides the detection (handy to check the guides).
  const forced = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '').get('platform');
  if (forced === 'mac' || forced === 'linux' || forced === 'windows') return forced;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (name.includes('mac')) return 'mac';
  if (name.includes('linux') || name.includes('x11') || name.includes('cros')) return 'linux';
  return 'windows';
}
