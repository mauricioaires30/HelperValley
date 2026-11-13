import { describe, expect, it } from 'vitest';
import { mainFileName } from '../sources';

const set = (...names: string[]) => new Set(names);

describe('which file is a save folder main file', () => {
  it('is the file named after the folder, as the game writes it', () => {
    expect(mainFileName(set('SaveGameInfo', 'Farm_123', 'Farm_123_old', 'SaveGameInfo_old'), 'Farm_123')).toBe('Farm_123');
  });

  it('finds the save in a folder duplicated in Windows', () => {
    expect(mainFileName(set('SaveGameInfo', 'SaveGameInfo_old', 'Farm_123', 'Farm_123_old'), 'Farm_123 - Copia')).toBe('Farm_123');
  });

  it('is nothing without SaveGameInfo, or when it cannot tell which file is the save', () => {
    expect(mainFileName(set('Farm_123'), 'Farm_123')).toBeNull();
    expect(mainFileName(set('SaveGameInfo', 'Farm_123', 'Other_456'), 'Mixed')).toBeNull();
    expect(mainFileName(set('SaveGameInfo', 'notes.txt'), 'Junk')).toBeNull();
  });
});
