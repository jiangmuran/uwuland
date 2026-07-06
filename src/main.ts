import { createDomUIPort } from './ui/dom-ui-port';
import { initChrome, changeState, shake, renderFilePage } from './ui/chrome';
import { loadChapterScript } from './content/manifest';
import { startChapter, resumeChapter } from './engine/driver';
import { GameState } from './engine/state';
import { saveGame, type SaveSlot } from './engine/save';
import type { ScriptResult } from './engine/interpreter';
import type { SaveData } from './engine/state';

const FIRST_CHAPTER = '一、白色的鸟';
// autoSaveIfEnabled 是下面的函数声明(hoisted),此处只是把引用传进去,
// 直到玩家真正触发 !pause 时才会被调用,那时 currentState 早已初始化。
const ui = createDomUIPort(autoSaveIfEnabled);
let currentState = new GameState();

function nowString(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function autoSaveIfEnabled(): void {
  const checkbox = document.getElementById('turn-auto') as HTMLInputElement | null;
  if (checkbox?.checked) saveGame('auto', currentState.toSaveData(nowString()));
}

async function driveUntilExit(result: ScriptResult): Promise<void> {
  let next = result;
  while (next.type === 'jump') {
    const run = await startChapter(next.target, currentState, ui, loadChapterScript);
    currentState = run.state;
    autoSaveIfEnabled();
    next = run.result;
  }
}

async function playFromStart(): Promise<void> {
  currentState = new GameState();
  const run = await startChapter(FIRST_CHAPTER, currentState, ui, loadChapterScript);
  currentState = run.state;
  autoSaveIfEnabled();
  await driveUntilExit(run.result);
}

async function playFromSave(data: SaveData): Promise<void> {
  const run = await resumeChapter(data, ui, loadChapterScript);
  currentState = run.state;
  autoSaveIfEnabled();
  await driveUntilExit(run.result);
}

function manualSave(slot: SaveSlot): void {
  saveGame(slot, currentState.toSaveData(nowString()));
}

function on(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener('click', handler);
}

function wireUp(): void {
  on('hide', () => changeState('window', true));
  on('kick', () => shake());
  on('start-button', () => {
    changeState('home', true);
    void playFromStart();
  });
  on('home-load-button', () => renderFilePage('load', (data) => void playFromSave(data), manualSave));
  on('home-set-button', () => changeState('setting'));
  on('home-about-button', () => changeState('about'));
  on('about-back', () => changeState('about', true));
  on('setting-back', () => changeState('setting', true));
  on('file-page-back', () => changeState('file-page', true));
  on('tool-home', () => changeState('home'));
  on('tool-save', () => renderFilePage('save', () => {}, manualSave));
  on('tool-load', () => renderFilePage('load', (data) => void playFromSave(data), manualSave));
  on('tool-set', () => changeState('setting'));
  on('tool-about', () => changeState('about'));
  on('thumbnail', () => changeState('window'));
  on('menu', () => changeState('state'));
  on('close', () => changeState('state', true));
}

initChrome();
wireUp();
