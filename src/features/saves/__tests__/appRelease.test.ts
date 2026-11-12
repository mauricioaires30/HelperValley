import { describe, expect, it } from 'vitest';
import { pickAsset } from '../appRelease';

const asset = (name: string) => ({ name, browser_download_url: `https://example.com/${name}` });
const release = [
  asset('HelperValley_0.1.0_x64-setup.exe'),
  asset('HelperValley_0.1.0_x64-setup.exe.sig'),
  asset('HelperValley_0.1.0_universal.dmg'),
  asset('HelperValley_universal.app.tar.gz'),
  asset('HelperValley_0.1.0_amd64.AppImage'),
  asset('HelperValley_0.1.0_amd64.deb'),
  asset('latest.json'),
];

describe('pickAsset', () => {
  it('offers the installer for each system', () => {
    expect(pickAsset(release, 'windows')?.name).toBe('HelperValley_0.1.0_x64-setup.exe');
    expect(pickAsset(release, 'mac')?.name).toBe('HelperValley_0.1.0_universal.dmg');
    expect(pickAsset(release, 'linux')?.name).toBe('HelperValley_0.1.0_amd64.AppImage');
  });

  it('falls back to another package, or nothing', () => {
    expect(pickAsset([asset('HelperValley_0.1.0_amd64.deb')], 'linux')?.name).toBe('HelperValley_0.1.0_amd64.deb');
    expect(pickAsset([asset('latest.json')], 'mac')).toBeNull();
  });
});
