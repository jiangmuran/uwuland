import { describe, it, expect, beforeEach } from 'vitest';
import { parseScript } from './parser';
import { GameState } from './state';
import { runScript, wrapForResume } from './interpreter';
import { saveGame, loadGame } from './save';
import type { UIPort, TextStyle } from './ui-port';

const CHAPTER_SCRIPT = [
  '!head #4f0',
  '你好',
  '!stat affinity +1',
  '!if affinity>=1',
  '好感度提升了',
  '!else',
  '没有变化',
  '!endif',
  '!item add key',
  '!pause',
  '继续之前的对话',
  '!pause',
  '!pick 开门|绕路 目标A|目标B :: has key|true',
].join('\n');

class RecordingUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  pausesSeen = 0;
  async showText(text: string, style: TextStyle): Promise<void> { this.shown.push({ text, style }); }
  async showChoices(): Promise<number> { return 0; }
  setHead(): void {}
  clearText(): void {}
  async wait(): Promise<void> {}
  async pause(): Promise<void> { this.pausesSeen++; }
  async runPuzzle(): Promise<Record<string, number | boolean>> { return {}; }
}

describe('集成:解析 -> 执行 -> 存档 -> 续读', () => {
  beforeEach(() => localStorage.clear());

  it('runs a full chapter, mutating state and choosing a gated pick option', async () => {
    const ui = new RecordingUIPort();
    const state = new GameState();
    state.enterChapter('测试章节');

    const result = await runScript(parseScript(CHAPTER_SCRIPT), state, ui);

    expect(ui.shown.map((s) => s.text)).toEqual(['你好', '好感度提升了', '继续之前的对话']);
    expect(state.getVar('affinity')).toBe(1);
    expect(state.hasItem('key')).toBe(true);
    // 有 key,所以"开门"选项(索引0)可用,RecordingUIPort 总是选第0个
    expect(result).toEqual({ type: 'jump', target: '目标A' });
  });

  it('save mid-chapter, reload, and resume replays state correctly without double-applying mutations', async () => {
    // 第一遍:跑到第一个 !pause 就"存档"(模拟点击存档按钮)
    const state1 = new GameState();
    state1.enterChapter('测试章节');
    const nodes = parseScript(CHAPTER_SCRIPT);

    // 手动只跑到第一次 pause:用一个在第1次 pause 后抛特殊信号来"提前终止"的 UIPort
    class StopAfterFirstPause extends RecordingUIPort {
      async pause(): Promise<void> {
        await super.pause();
        if (this.pausesSeen === 1) throw new Error('__STOP__');
      }
    }
    const stopper = new StopAfterFirstPause();
    await expect(runScript(nodes, state1, stopper)).rejects.toThrow('__STOP__');

    expect(state1.getVar('affinity')).toBe(1);
    expect(state1.hasItem('key')).toBe(true);
    expect(state1.pauseIndex).toBe(1); // 第一次 !pause,pauseIndex 从 0 变成 1

    saveGame('auto', state1.toSaveData('2026-07-06 12:00:00'));

    // 第二遍:全新的 GameState,从存档恢复并续读
    const saved = loadGame('auto');
    expect(saved).not.toBeNull();
    const state2 = GameState.fromSaveData(saved!);
    const ui2 = new RecordingUIPort();
    const resumeUi = wrapForResume(ui2, saved!.pauseIndex);

    const result = await runScript(parseScript(CHAPTER_SCRIPT), state2, resumeUi);

    // 续读时不应该重复触发"好感度提升了"这行文本(它在第一次 pause 之前)
    expect(ui2.shown.map((s) => s.text)).toEqual(['继续之前的对话']);
    // 但状态应该和"一路正常玩下来"完全一致,而不是被重复叠加
    expect(state2.getVar('affinity')).toBe(1);
    expect(state2.hasItem('key')).toBe(true);
    expect(result).toEqual({ type: 'jump', target: '目标A' });
  });
});
