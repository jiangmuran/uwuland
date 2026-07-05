import { describe, it, expect, beforeEach } from 'vitest';
import { saveGame, loadGame } from './save';
import type { SaveData } from './state';

const sample: SaveData = {
  chapter: '一、白色的鸟',
  pauseIndex: 2,
  entryVars: { affinity_bird: 1 },
  entryInventory: ['key'],
  time: '2026-07-06 12:00:00',
};

describe('saveGame / loadGame', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when there is no save in the slot', () => {
    expect(loadGame('auto')).toBeNull();
  });

  it('round-trips a save through a slot', () => {
    saveGame('manual', sample);
    expect(loadGame('manual')).toEqual(sample);
    expect(loadGame('auto')).toBeNull();
  });

  it('treats malformed JSON as no save rather than throwing', () => {
    localStorage.setItem('uwuland-save-auto', '{not json');
    expect(loadGame('auto')).toBeNull();
  });

  it('treats a save missing required fields as no save (old-format saves)', () => {
    localStorage.setItem('uwuland-save-auto', JSON.stringify({ title: '一、白色的鸟', tag: '3' }));
    expect(loadGame('auto')).toBeNull();
  });
});
