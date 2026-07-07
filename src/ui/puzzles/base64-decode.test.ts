import { describe, it, expect, vi } from 'vitest';
import { mountBase64Decode } from './base64-decode';

function setUp(param: string) {
  const container = document.createElement('div');
  const resolve = vi.fn();
  mountBase64Decode({ container, param, resolve });
  return { container, resolve };
}

describe('mountBase64Decode', () => {
  it('渲染密文提示、输入框和提交按钮', () => {
    const { container } = setUp('aGVsbG8=');
    expect(container.textContent).toContain('aGVsbG8=');
    expect(container.querySelector('input')).not.toBeNull();
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('输入正确答案并点击提交,resolve({success:true, attempts:1})', async () => {
    vi.useFakeTimers();
    const { container, resolve } = setUp('aGVsbG8='); // atob → "hello"
    (container.querySelector('input') as HTMLInputElement).value = 'hello';
    (container.querySelector('button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledWith({ success: true, attempts: 1 });
    vi.useRealTimers();
  });

  it('答案两侧多余空格不影响判定', async () => {
    vi.useFakeTimers();
    const { container, resolve } = setUp('aGVsbG8=');
    (container.querySelector('input') as HTMLInputElement).value = '  hello  ';
    (container.querySelector('button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledWith({ success: true, attempts: 1 });
    vi.useRealTimers();
  });

  it('回车键也能提交', async () => {
    vi.useFakeTimers();
    const { container, resolve } = setUp('aGVsbG8=');
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(resolve).toHaveBeenCalledWith({ success: true, attempts: 1 });
    vi.useRealTimers();
  });

  it('答案错误时不resolve,显示第几次尝试', () => {
    const { container, resolve } = setUp('aGVsbG8=');
    (container.querySelector('input') as HTMLInputElement).value = 'wrong';
    (container.querySelector('button') as HTMLButtonElement).click();
    expect(resolve).not.toHaveBeenCalled();
    expect(container.querySelector('.puzzle-feedback')!.textContent).toContain('1');
  });

  it('错误达到3次后,提示信息里出现"提示"字样', () => {
    const { container, resolve } = setUp('aGVsbG8=');
    const input = container.querySelector('input') as HTMLInputElement;
    const button = container.querySelector('button') as HTMLButtonElement;
    input.value = 'wrong';
    button.click();
    button.click();
    button.click();
    expect(resolve).not.toHaveBeenCalled();
    expect(container.querySelector('.puzzle-feedback')!.textContent).toContain('提示');
  });

  it('参数不是合法Base64时,显示配置错误而不是抛异常', () => {
    const { container } = setUp('这不是合法的base64!!!');
    expect(container.textContent).toContain('谜题配置错误');
  });
});
