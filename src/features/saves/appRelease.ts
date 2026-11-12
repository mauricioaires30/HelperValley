import type { Platform } from '@/save/platform';

export const APP_REPO = 'mauricioaires30/HelperValley';
export const APP_RELEASES_URL = `https://github.com/${APP_REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface AppRelease {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

/** Installer names from the Tauri build, best first for each system. */
const PATTERNS: Record<Platform, RegExp[]> = {
  windows: [/_x64-setup\.exe$/i, /\.exe$/i, /\.msi$/i],
  mac: [/universal\.dmg$/i, /\.dmg$/i],
  linux: [/\.AppImage$/i, /\.deb$/i],
};

/** The installer to offer on this system, if the release has one. */
export function pickAsset(assets: ReleaseAsset[], platform: Platform): ReleaseAsset | null {
  for (const pattern of PATTERNS[platform]) {
    const asset = assets.find((a) => pattern.test(a.name));
    if (asset) return asset;
  }
  return null;
}

const CACHE_KEY = 'hv-app-release-v2';
/** GitHub allows 60 API requests an hour per visitor; a new release shows up within this time. */
const CACHE_MS = 10 * 60_000;

/** The latest desktop app release, from GitHub's API. Null while no app was released yet. App releases are tagged "app-v…". */
export async function latestAppRelease(): Promise<AppRelease | null> {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; release: AppRelease | null } | null;
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.release;
  } catch {
    // no cache
  }
  const response = await fetch(`https://api.github.com/repos/${APP_REPO}/releases?per_page=20`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const releases = (await response.json()) as Array<AppRelease & { draft: boolean; prerelease: boolean }>;
  const release = releases.find((r) => r.tag_name.startsWith('app-v') && !r.draft && !r.prerelease) ?? null;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
  } catch {
    // no cache
  }
  return release;
}
