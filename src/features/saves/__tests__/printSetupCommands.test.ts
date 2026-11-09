import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { REVERT_COMMAND, SETUP_COMMAND } from '../setupCommands';

/** Writes the exact commands of the guide to SETUP_TEST_OUT, for tools/setup-tests. Does nothing otherwise. */
it('prints the setup commands', () => {
  const out = process.env.SETUP_TEST_OUT;
  if (!out) return;
  mkdirSync(out, { recursive: true });
  for (const platform of ['windows', 'mac', 'linux'] as const) {
    writeFileSync(`${out}/setup-${platform}.txt`, SETUP_COMMAND[platform]);
    writeFileSync(`${out}/revert-${platform}.txt`, REVERT_COMMAND[platform]);
  }
});
