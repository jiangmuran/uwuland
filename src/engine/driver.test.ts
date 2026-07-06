import { describe, it, expect, beforeEach } from 'vitest';
import { startChapter, resumeChapter } from './driver';
import { GameState } from './state';
import { saveGame, loadGame } from './save';
import type { UIPort, TextStyle } from './ui-port';

class RecordingUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  async showText(text: string, style: TextStyle): Promise<void> {
    this.shown.push({ text, style });
  }
  async showChoices(): Promise<number> {
    return 0;
  }
  setHead(): void {}
  clearText(): void {}
  async wait(): Promise<void> {}
  async pause(): Promise<void> {}
  async runPuzzle(): Promise<Record<string, number | boolean>> {
    return {};
  }
}

const SCRIPTS: Record<string, string> = {
  一: ['你好', '!stat affinity +1', '!pause', '!pick 下一章|留下 二|一 :: true|true'].join('\n'),
  二: '欢迎来到第二章',
};
const loadScript = (name: string): string => SCRIPTS[name];

describe('startChapter', () => {
  it('调用 enterChapter,返回被修改的 state 和执行结果', async () => {
    const state = new GameState();
    const ui = new RecordingUIPort();
    const { state: returned, result } = await startChapter('一', state, ui, loadScript);
    expect(returned).toBe(state);
    expect(state.chapter).toBe('一');
    expect(state.getVar('affinity')).toBe(1);
    expect(result).toEqual({ type: 'jump', target: '二' });
  });
});

describe('resumeChapter', () => {
  beforeEach(() => localStorage.clear());

  it('从存档重建 state,静默重放到暂停点,再正常继续', async () => {
    const state1 = new GameState();
    class StopAtPause extends RecordingUIPort {
      async pause(): Promise<void> {
        throw new Error('__STOP__');
      }
    }
    await expect(startChapter('一', state1, new StopAtPause(), loadScript)).rejects.toThrow('__STOP__');
    saveGame('auto', state1.toSaveData('now'));

    const saved = loadGame('auto')!;
    const ui2 = new RecordingUIPort();
    const { state: state2, result } = await resumeChapter(saved, ui2, loadScript);

    expect(ui2.shown).toEqual([]); // "你好"在暂停点之前,续读时静默跳过
    expect(state2.getVar('affinity')).toBe(1); // 没有重复叠加
    expect(result).toEqual({ type: 'jump', target: '二' });
  });
});
