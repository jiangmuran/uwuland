import { describe, it, expect } from 'vitest';
import { parseScript } from '../engine/parser';
import { CHAPTERS, loadChapterScript } from './manifest';

describe('剧情内容迁移', () => {
  it('包含全部4个章节', () => {
    expect(Object.keys(CHAPTERS)).toEqual([
      '一、白色的鸟',
      '二、灰色的屋',
      '三、绿色的门',
      '四、蓝色的海',
    ]);
  });

  it.each(Object.keys(CHAPTERS))('%s 能被 parseScript 正确解析,不抛错', (name) => {
    expect(() => parseScript(CHAPTERS[name])).not.toThrow();
  });

  it('loadChapterScript 对未知章节抛出清晰错误', () => {
    expect(() => loadChapterScript('不存在的章节')).toThrow(/未知章节/);
  });

  it('一、白色的鸟 结尾正确跳转到二、灰色的屋', () => {
    const nodes = parseScript(CHAPTERS['一、白色的鸟']);
    const last = nodes[nodes.length - 1];
    expect(last.kind).toBe('pick');
    if (last.kind === 'pick') expect(last.targets).toEqual(['二、灰色的屋']);
  });

  it('三、绿色的门 结尾正确跳转到四、蓝色的海', () => {
    const nodes = parseScript(CHAPTERS['三、绿色的门']);
    const last = nodes[nodes.length - 1];
    expect(last.kind).toBe('pick');
    if (last.kind === 'pick') expect(last.targets).toEqual(['四、蓝色的海']);
  });
});
