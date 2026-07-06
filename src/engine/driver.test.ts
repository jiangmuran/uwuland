import { describe, it, expect, beforeEach } from 'vitest';
import { startChapter, resumeChapter } from './driver';
import { GameState, type SaveData } from './state';
import { saveGame, loadGame } from './save';
import type { UIPort, TextStyle } from './ui-port';

// 基础替身:刻意不实现可选的 announceChapter,以此证明 driver 的
// `ui.announceChapter?.()` 在替身没有该方法时也不会崩溃(可选链的运行时保护)。
class RecordingUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  cleared = 0;
  async showText(text: string, style: TextStyle): Promise<void> {
    this.shown.push({ text, style });
  }
  async showChoices(): Promise<number> {
    return 0;
  }
  setHead(): void {}
  clearText(): void {
    this.cleared++;
  }
  async wait(): Promise<void> {}
  async pause(): Promise<void> {}
  async runPuzzle(): Promise<Record<string, number | boolean>> {
    return {};
  }
}

// 实现了可选 announceChapter 的替身,用于断言 driver 用正确的章节名调用它。
class AnnouncingUIPort extends RecordingUIPort {
  announced: string[] = [];
  announceChapter(name: string): void {
    this.announced.push(name);
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

  it('开章时清空对话框并用正确的章节名播放标题闪屏', async () => {
    const state = new GameState();
    const ui = new AnnouncingUIPort();
    await startChapter('一', state, ui, loadScript);
    // 清空对话框(要求 b):脚本"一"本身没有 !clear,所以这一次清空只能来自 driver。
    expect(ui.cleared).toBe(1);
    // 章节标题闪屏(要求 a):announceChapter 只由 driver 调用,用当前章节名。
    expect(ui.announced).toEqual(['一']);
  });

  it('替身未实现可选的 announceChapter 时也不会崩溃', async () => {
    const state = new GameState();
    const ui = new RecordingUIPort(); // 没有 announceChapter
    await expect(startChapter('一', state, ui, loadScript)).resolves.toBeDefined();
    expect(ui.cleared).toBe(1);
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

  it('在重放的任何 !pause 触发之前,就同步把重建好的 state 交给 onStateReady(修复自动存档写坏存档的 bug)', async () => {
    // 直接构造一个存档:章节"一"、pauseIndex=1、入口变量 affinity=3。
    // fromSaveData 重建时会带上这些"入口快照"变量,以此证明回调拿到的是真正从存档
    // 重建出来的 state,而不是一个空白的 new GameState()(即原 bug 里被误存的 stale state)。
    const saved: SaveData = {
      chapter: '一',
      pauseIndex: 1,
      entryVars: { affinity: 3 },
      entryInventory: [],
      time: 'now',
    };

    const events: string[] = [];
    let readyState: GameState | null = null;
    let readyChapter: string | undefined;
    let readyAffinity: number | undefined;

    class PauseWatchingUI extends RecordingUIPort {
      async pause(): Promise<void> {
        events.push('pause');
      }
    }

    const { state: returned } = await resumeChapter(saved, new PauseWatchingUI(), loadScript, (s) => {
      events.push('ready');
      readyState = s;
      // 同步快照:回调触发那一刻的值(之后重放会继续改动同一个对象,这里先记录下来)。
      readyChapter = s.chapter;
      readyAffinity = s.getVar('affinity');
    });

    // 关键顺序断言:onStateReady 必须早于重放里的第一个 pause。
    // 若把 onStateReady 挪到 runScript 之后(原 bug 的时机),events[0] 会变成 'pause',测试立即失败。
    expect(events[0]).toBe('ready');
    expect(events).toContain('pause'); // 非空:重放确实真的触发过一次 pause,不是空跑白测
    // 回调收到的正是 resumeChapter 内部新建、并最终返回的那个 state 对象引用。
    expect(readyState).toBe(returned);
    // 且它已反映存档内容:章节名 + 入口变量,而不是空白 state。
    expect(readyChapter).toBe('一');
    expect(readyAffinity).toBe(3);
  });

  it('续读开始时清空对话框并用存档里的章节名播放标题闪屏', async () => {
    const saved: SaveData = {
      chapter: '一',
      pauseIndex: 1,
      entryVars: {},
      entryInventory: [],
      time: 'now',
    };
    const ui = new AnnouncingUIPort();
    await resumeChapter(saved, ui, loadScript);
    // 清空对话框(要求 b):脚本"一"没有 !clear,这一次清空只能来自 driver。
    expect(ui.cleared).toBe(1);
    // 标题闪屏(要求 a):announceChapter 只由 driver 调用,且用的是 saved.chapter。
    expect(ui.announced).toEqual(['一']);
  });
});
