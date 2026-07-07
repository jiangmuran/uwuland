import { describe, it, expect, vi } from 'vitest';
import { runPuzzle } from './registry';

describe('runPuzzle', () => {
  it('按"类型:参数"解析,把参数原样传给对应谜题', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const promise = runPuzzle('base64decode:aGVsbG8=', container);
    expect(container.textContent).toContain('aGVsbG8=');
    (container.querySelector('input') as HTMLInputElement).value = 'hello';
    (container.querySelector('button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result.success).toBe(true);
    vi.useRealTimers();
  });

  it('没有冒号时,整个字符串当类型,参数是空字符串', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const promise = runPuzzle('base64decode', container);
    // atob('') 合法,解码结果是空字符串,不填输入框直接提交即可判定正确
    (container.querySelector('button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result.success).toBe(true);
    vi.useRealTimers();
  });

  it('未注册的谜题类型,返回的 Promise 会 reject 并带清晰错误信息', async () => {
    const container = document.createElement('div');
    await expect(runPuzzle('不存在的谜题类型', container)).rejects.toThrow(/未知谜题类型/);
  });
});
