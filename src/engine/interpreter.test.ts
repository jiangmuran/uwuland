import { describe, it, expect } from 'vitest';
import { parseScript } from './parser';
import { GameState } from './state';
import { runScript, wrapForResume } from './interpreter';
import type { UIPort, TextStyle } from './ui-port';

class FakeUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  heads: string[] = [];
  pauseCount = 0;
  cleared = 0;
  nextChoice = 0;
  puzzleResults: Record<string, Record<string, number | boolean>> = {};

  async showText(text: string, style: TextStyle): Promise<void> {
    this.shown.push({ text, style });
  }
  async showChoices(options: string[]): Promise<number> {
    void options;
    return this.nextChoice;
  }
  setHead(value: string): void {
    this.heads.push(value);
  }
  clearText(): void {
    this.cleared++;
  }
  async wait(): Promise<void> {}
  async pause(): Promise<void> {
    this.pauseCount++;
  }
  async runPuzzle(name: string): Promise<Record<string, number | boolean>> {
    return this.puzzleResults[name] ?? {};
  }
}

describe('runScript: 基本指令', () => {
  it('shows text lines in order and reports exit', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    const result = await runScript(parseScript('line one\nline two'), state, ui);
    expect(ui.shown.map((s) => s.text)).toEqual(['line one', 'line two']);
    expect(result).toEqual({ type: 'exit' });
  });

  it('applies !head / !clear / !stat / !flag / !item', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    await runScript(
      parseScript(['!head #4f0', '!clear', '!stat affinity_bird +2', '!flag met_bird', '!item add key'].join('\n')),
      state,
      ui,
    );
    expect(ui.heads).toEqual(['#4f0']);
    expect(ui.cleared).toBe(1);
    expect(state.getVar('affinity_bird')).toBe(2);
    expect(state.getVar('met_bird')).toBe(1);
    expect(state.hasItem('key')).toBe(true);
  });

  it('tracks pauseIndex across !pause commands', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    await runScript(parseScript(['a', '!pause', 'b', '!pause', 'c'].join('\n')), state, ui);
    expect(ui.pauseCount).toBe(2);
    expect(state.pauseIndex).toBe(2); // 1-indexed 计数:两次 !pause 后依次变成 1、2
  });
});

describe('runScript: !if/!elif/!else', () => {
  it('executes only the matching branch, respecting pauseIndex across branches', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    state.setVar('affinity_bird', 5);
    await runScript(
      parseScript(['!if affinity_bird>=3', 'high', '!pause', '!elif affinity_bird>=1', 'mid', '!else', 'low', '!endif', 'after'].join('\n')),
      state,
      ui,
    );
    expect(ui.shown.map((s) => s.text)).toEqual(['high', 'after']);
    expect(ui.pauseCount).toBe(1);
  });
});

describe('runScript: !pick 与条件门槛', () => {
  it('filters out options whose condition is false, and jumps to the chosen target', async () => {
    const ui = new FakeUIPort();
    ui.nextChoice = 0;
    const state = new GameState();
    const result = await runScript(
      parseScript('!pick 开门|绕路 目标A|目标B :: has key|true'),
      state,
      ui,
    );
    // 没有 key,所以只剩"绕路"一个选项传给 showChoices
    expect(result).toEqual({ type: 'jump', target: '目标B' });
  });

  it('offers the gated option once the condition becomes true', async () => {
    const ui = new FakeUIPort();
    ui.nextChoice = 0;
    const state = new GameState();
    state.addItem('key');
    const result = await runScript(
      parseScript('!pick 开门|绕路 目标A|目标B :: has key|true'),
      state,
      ui,
    );
    expect(result).toEqual({ type: 'jump', target: '目标A' });
  });

  it('throws a clear error (not an opaque TypeError) when every option condition is false', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    // 既没有 key 也没有 crowbar,两个选项的条件都为 false,过滤后没有任何可展示的选项。
    // 期望抛出一条指向内容错误的清晰错误,而不是 available[chosen].idx 的 TypeError。
    await expect(
      runScript(parseScript('!pick 开门|撬锁 目标A|目标B :: has key|has crowbar'), state, ui),
    ).rejects.toThrow(/!pick 没有任何可用选项/);
  });
});

describe('runScript: !puzzle', () => {
  it('writes numeric/boolean puzzle results back into vars', async () => {
    const ui = new FakeUIPort();
    ui.puzzleResults.base64decode = { success: true, attempts: 2 };
    const state = new GameState();
    await runScript(parseScript('!puzzle base64decode'), state, ui);
    expect(state.getVar('success')).toBe(1);
    expect(state.getVar('attempts')).toBe(2);
  });
});

describe('runScript: !load / !exit', () => {
  it('!load returns a jump result', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    const result = await runScript(parseScript('!load 二、灰色的屋'), state, ui);
    expect(result).toEqual({ type: 'jump', target: '二、灰色的屋' });
  });

  it('!exit returns an exit result and stops before later lines', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    await runScript(parseScript(['before', '!exit', 'after'].join('\n')), state, ui);
    expect(ui.shown.map((s) => s.text)).toEqual(['before']);
  });
});

describe('wrapForResume', () => {
  it('suppresses showText/wait and auto-resolves pause() until the target pause count, then behaves normally', async () => {
    const real = new FakeUIPort();
    const wrapped = wrapForResume(real, 2);

    await wrapped.showText('skipped', 'normal');
    await wrapped.pause(); // seen=1, still skipping
    await wrapped.showText('also skipped', 'normal');
    await wrapped.pause(); // seen=2, matches target -> blocks for real
    await wrapped.showText('shown', 'normal');

    expect(real.shown.map((s) => s.text)).toEqual(['shown']);
    expect(real.pauseCount).toBe(1); // 只有到达目标暂停点那一次真正调用了 real.pause()
  });

  it('with resumeAtPauseCount 0, behaves exactly like the real port', async () => {
    const real = new FakeUIPort();
    const wrapped = wrapForResume(real, 0);
    await wrapped.showText('hello', 'normal');
    await wrapped.pause();
    expect(real.shown.map((s) => s.text)).toEqual(['hello']);
    expect(real.pauseCount).toBe(1);
  });
});
