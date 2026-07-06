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
  const result = await runScript(parseScript(loadScript(chapterName)), state, ui);
  return { state, result };
}

export async function resumeChapter(
  saved: SaveData,
  ui: UIPort,
  loadScript: ChapterSource,
): Promise<ChapterRun> {
  const state = GameState.fromSaveData(saved);
  const resumeUi = wrapForResume(ui, saved.pauseIndex);
  const result = await runScript(parseScript(loadScript(saved.chapter)), state, resumeUi);
  return { state, result };
}
