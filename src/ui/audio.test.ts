import { describe, it, expect, beforeEach } from 'vitest';
import { playSound } from './audio';

describe('playSound', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('没有音效开关元素时不抛错(视为关闭)', () => {
    expect(() => playSound('button05')).not.toThrow();
  });

  it('音效开关未勾选时不抛错', () => {
    document.body.innerHTML = '<input id="turn-sound" type="checkbox">';
    expect(() => playSound('button05')).not.toThrow();
  });

  it('音效开关勾选时尝试播放,不抛错', () => {
    document.body.innerHTML = '<input id="turn-sound" type="checkbox" checked>';
    expect(() => playSound('button01a', 1)).not.toThrow();
  });
});
