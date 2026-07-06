import { parseScript } from './parser';
import { runScript, wrapForResume, type ScriptResult } from './interpreter';
import { GameState, type SaveData } from './state';
import type { UIPort } from './ui-port';

export interface ChapterSource {
  (chapterName: string): string;
}

export interface ChapterRun {
  state: GameState;
  result: ScriptResult;
}

export async function startChapter(
  chapterName: string,
  state: GameState,
  ui: UIPort,
  loadScript: ChapterSource,
): Promise<ChapterRun> {
  state.enterChapter(chapterName);
  // 每章开始都清空对话框、播放章节标题闪屏(对齐原 game-engine.js 的 loadText)。
  ui.clearText();
  ui.announceChapter?.(chapterName);
  const result = await runScript(parseScript(loadScript(chapterName)), state, ui);
  return { state, result };
}

export async function resumeChapter(
  saved: SaveData,
  ui: UIPort,
  loadScript: ChapterSource,
  onStateReady?: (state: GameState) => void,
): Promise<ChapterRun> {
  const state = GameState.fromSaveData(saved);
  // 在任何重放暂停触发之前,先把重建好的 state 交给调用方,
  // 这样 main.ts 的 currentState 会先指向正确对象,自动存档才不会写坏刚读取的存档。
  onStateReady?.(state);
  // 续读同样要清空对话框并播放本章标题闪屏(对齐原 game-engine.js 的 loadText)。
  ui.clearText();
  ui.announceChapter?.(saved.chapter);
  const resumeUi = wrapForResume(ui, saved.pauseIndex);
  const result = await runScript(parseScript(loadScript(saved.chapter)), state, resumeUi);
  return { state, result };
}
