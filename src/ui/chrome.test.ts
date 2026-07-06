import { describe, it, expect, beforeEach, vi } from 'vitest';
import { zfill, changeState, renderFilePage } from './chrome';
import { saveGame } from '../engine/save';
import { GameState } from '../engine/state';

function baseDom(): void {
  document.body.innerHTML = `
    <div id="file-page">
      <div class="box" id="auto"><div id="auto-save"></div></div>
      <div class="box" id="manual"><div id="manual-save"></div></div>
    </div>
    <div id="home"></div>
  `;
  // 故意不放 #turn-sound:playSound() 在找不到音效开关元素时按"关闭"处理并直接返回,
  // 这些测试不关心音效,让 changeState()/renderFilePage() 内部调用 playSound() 静默跳过即可。
}

describe('zfill', () => {
  it('数字左边补0到指定宽度', () => {
    expect(zfill(7, 3)).toBe('007');
    expect(zfill(70, 3)).toBe('070');
    expect(zfill(700, 3)).toBe('700');
  });

  it('宽度默认是2', () => {
    expect(zfill(5)).toBe('05');
  });
});

describe('changeState', () => {
  beforeEach(baseDom);

  it('切换目标元素的display,并在id为file-page时重置所有.box', () => {
    const box = document.getElementById('auto')!;
    box.onclick = () => {};
    box.style.display = 'none';
    changeState('file-page', false);
    expect(document.getElementById('file-page')!.style.display).toBe('block');
    expect(box.onclick).toBeNull();
    expect(box.style.display).toBe('block');
  });
});

describe('renderFilePage', () => {
  beforeEach(() => {
    baseDom();
    localStorage.clear();
  });

  it('load模式下,有存档的槽位点击后调用onLoad', () => {
    const state = new GameState();
    state.enterChapter('一、白色的鸟');
    saveGame('manual', state.toSaveData('2026-07-07 00:00:00'));

    const onLoad = vi.fn();
    renderFilePage('load', onLoad, () => {});

    expect(document.getElementById('manual-save')!.innerHTML).toContain('一、白色的鸟');
    expect(document.getElementById('auto-save')!.innerHTML).toContain('Not Data');

    (document.getElementById('manual') as HTMLElement).click();
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0][0].chapter).toBe('一、白色的鸟');
  });

  it('save模式下,auto槽位隐藏,manual槽位点击后调用onSave', () => {
    const onSave = vi.fn();
    renderFilePage('save', () => {}, onSave);

    expect(document.getElementById('auto')!.style.display).toBe('none');
    (document.getElementById('manual') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledWith('manual');
  });
});
