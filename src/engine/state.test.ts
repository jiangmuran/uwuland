import { describe, it, expect } from 'vitest';
import { GameState } from './state';

describe('GameState: 变量与背包', () => {
  it('defaults unset vars to 0 and unset items to absent', () => {
    const state = new GameState();
    expect(state.getVar('affinity_bird')).toBe(0);
    expect(state.hasItem('key')).toBe(false);
  });

  it('sets and reads vars', () => {
    const state = new GameState();
    state.setVar('affinity_bird', 3);
    expect(state.getVar('affinity_bird')).toBe(3);
  });

  it('adds and removes items', () => {
    const state = new GameState();
    state.addItem('key');
    expect(state.hasItem('key')).toBe(true);
    state.removeItem('key');
    expect(state.hasItem('key')).toBe(false);
  });
});

describe('GameState: 章节入口快照', () => {
  it('enterChapter resets pauseIndex and captures an entry snapshot', () => {
    const state = new GameState();
    state.setVar('affinity_bird', 1);
    state.pauseIndex = 5;
    state.enterChapter('二、灰色的屋');
    expect(state.chapter).toBe('二、灰色的屋');
    expect(state.pauseIndex).toBe(0);

    // 章节入口之后对当前状态的修改,不应该影响"入口快照"
    state.setVar('affinity_bird', 99);
    const saved = state.toSaveData('2026-07-06 12:00:00');
    expect(saved.entryVars.affinity_bird).toBe(1);
  });
});

describe('GameState.fromSaveData / toSaveData 往返', () => {
  it('reconstructs a GameState at chapter-entry from saved data', () => {
    const original = new GameState();
    original.setVar('affinity_bird', 2);
    original.addItem('key');
    original.enterChapter('三、绿色的门');
    original.pauseIndex = 4;

    const saved = original.toSaveData('2026-07-06 12:00:00');
    expect(saved).toEqual({
      chapter: '三、绿色的门',
      pauseIndex: 4,
      entryVars: { affinity_bird: 2 },
      entryInventory: ['key'],
      time: '2026-07-06 12:00:00',
    });

    const restored = GameState.fromSaveData(saved);
    expect(restored.chapter).toBe('三、绿色的门');
    expect(restored.pauseIndex).toBe(0);
    expect(restored.getVar('affinity_bird')).toBe(2);
    expect(restored.hasItem('key')).toBe(true);
  });
});
