# UWULAND 桌面渲染层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Plan 1 的引擎核心接到真实浏览器页面上,完全替换 `game-engine.js`/`ee-main.js`/`drama-init.js`,现有4章剧情原样迁移,桌面端视觉和交互与现在的版本保持一致。

**Architecture:** `src/engine/driver.ts` 补一个小的章节切换协调层(`startChapter`/`resumeChapter`),避免调用方漏调 `enterChapter`。`src/content/` 存放从 `drama-init.js` 迁移出来的4个纯文本 `.script` 文件。`src/ui/` 下三个模块各管一块:`audio.ts`(音效)、`dom-ui-port.ts`(实现引擎的 `UIPort` 接口,对话框/选项/头像的实际DOM渲染)、`chrome.ts`(窗口拖拽/设置/存读档面板/state面板/时间——这些和"剧情"无关的页面外壳,从 `ee-main.js` 移植)。`src/main.ts` 是唯一的应用入口,组装以上所有模块并驱动"读章节→跑引擎→处理跳转→读下一章节"的循环。

**Tech Stack:** TypeScript, Vite(这次真正启用打包/dev server),Vitest,happy-dom。

## Global Constraints

- 技术栈固定为 TypeScript + Vite 静态产物,不引入 React/Vue 等前端框架。
- 本计划**会**删除并替换 `game-engine.js`/`ee-main.js`/`drama-init.js`,这是"接入新引擎"这一步的正常范围(和 Plan 1 不同,Plan 1 明确不动这几个文件)。
- **`style.css` 本计划不做改动**(除非某个新增的DOM结构确实需要一个原来没有的class/id,否则不碰)。响应式/移动端的CSS重构是 Plan 3 的范围,这里只做桌面端。
- 视觉和交互的验收标准是"和现在桌面版本看起来、玩起来一样",不是"更好看"——不引入新样式。
- `!puzzle` 指令已经在引擎里,但目前4章内容都不会调用它;这次 `runPuzzle` 只需要在被调用时抛出清晰的"还没实现,等 Plan 4"错误,不需要真的做谜题UI。
- Apache-2.0 协议署名和 README 里"保留 PAPEREE 信息"的要求继续保留;state 面板里"Engine: game-engine"这行文案顺带更新成反映新引擎的说法(具体文案不影响功能,合理即可)。

## 本计划在整体重构中的位置

这是5份顺序计划中的第2份。Plan 1(引擎核心,`docs/superpowers/plans/2026-07-06-uwuland-engine-core.md`)已完成并推送:`src/engine/`(expressions/parser/state/save/interpreter + `ui-port.ts` 的 `UIPort` 接口)都已经实现、review通过。完成本计划的标志:`npm run dev` 打开页面后,能完整从"Start"玩到当前4章内容的结尾(含存档/读档/设置/窗口拖拽/about页面),行为和现在线上版本一致。之后(Plan 3)才轮到移动端响应式布局。

Plan 1 最终review时给这份计划留了几条具体建议,已经在下面的任务设计里吸收:
- 加一个引擎层的 `startChapter`/`resumeChapter` 协调函数,不要让调用方自己拼 `fromSaveData`+`wrapForResume`+`enterChapter`(Task 1)
- `UIPort.setHead` 要复刻原来"空值不生效"的判断(Task 4)

---

### Task 1: 引擎章节协调层(`src/engine/driver.ts`)

**Files:**
- Create: `src/engine/driver.ts`
- Test: `src/engine/driver.test.ts`

**Interfaces:**
- Consumes: `parseScript` (`./parser`)、`runScript`/`wrapForResume`/`ScriptResult` (`./interpreter`)、`GameState`/`SaveData` (`./state`)、`UIPort` (`./ui-port`)——全部来自 Plan 1,均已实现。
- Produces: `interface ChapterSource { (chapterName: string): string }`、`interface ChapterRun { state: GameState; result: ScriptResult }`、`startChapter(chapterName, state, ui, loadScript): Promise<ChapterRun>`、`resumeChapter(saved, ui, loadScript): Promise<ChapterRun>`——本计划 Task 6(`main.ts`)和 Task 2 的测试会用到这两个函数,以后任何驱动章节切换的代码都应该走这两个函数,不要自己组装 `enterChapter`/`fromSaveData`/`wrapForResume`。

- [ ] **Step 1: 写失败测试 `src/engine/driver.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { startChapter, resumeChapter } from './driver';
import { GameState } from './state';
import { saveGame, loadGame } from './save';
import type { UIPort, TextStyle } from './ui-port';

class RecordingUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  async showText(text: string, style: TextStyle): Promise<void> {
    this.shown.push({ text, style });
  }
  async showChoices(): Promise<number> {
    return 0;
  }
  setHead(): void {}
  clearText(): void {}
  async wait(): Promise<void> {}
  async pause(): Promise<void> {}
  async runPuzzle(): Promise<Record<string, number | boolean>> {
    return {};
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
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/engine/driver.test.ts`
Expected: FAIL,找不到模块 `./driver`。

- [ ] **Step 3: 实现 `src/engine/driver.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/engine/driver.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/engine/driver.ts src/engine/driver.test.ts
git commit -m "feat: add startChapter/resumeChapter driver to own the enterChapter+resume wiring"
```

---

### Task 2: 剧情内容迁移(`src/content/`)

**Files:**
- Create: `src/content/01-white-bird.script`
- Create: `src/content/02-grey-room.script`
- Create: `src/content/03-green-door.script`
- Create: `src/content/04-blue-sea.script`
- Create: `src/content/manifest.ts`
- Create: `src/vite-env.d.ts`
- Test: `src/content/manifest.test.ts`

**Interfaces:**
- Consumes: `parseScript` from `../engine/parser`(Plan 1,仅用于测试校验)。
- Produces: `CHAPTERS: Record<string, string>`、`loadChapterScript(name: string): string`——本计划 Task 6(`main.ts`)会用 `loadChapterScript` 作为 `driver.ts` 的 `ChapterSource` 参数。

**这个任务不是"设计新代码",是把 `drama-init.js` 里 `window.drama` 对象的4个键值原样搬到独立文件里。** 具体做法:

- [ ] **Step 1: 逐字提取内容**

打开 `drama-init.js`,找到 `window.drama` 对象。它有4个键,分别是章节标题字符串('一、白色的鸟'、'二、灰色的屋'、'三、绿色的门'、'四、蓝色的海'),对应的值是模板字符串(整段剧情文本,含 `!` 开头的指令行、`*^&` 开头的样式行等)。把每个键对应的**字符串内容原样**(不加不减一个字符,只是去掉 JS 模板字符串的反引号包裹)分别写入:

- `src/content/01-white-bird.script` ← `window.drama['一、白色的鸟']` 的值
- `src/content/02-grey-room.script` ← `window.drama['二、灰色的屋']` 的值
- `src/content/03-green-door.script` ← `window.drama['三、绿色的门']` 的值
- `src/content/04-blue-sea.script` ← `window.drama['四、蓝色的海']` 的值

**不要修改内容本身**(哪怕看到什么奇怪的行,比如 `*WCY的颜色我忘了...` 这种小字吐槽行,都是原有的正常功能,原样保留)。

- [ ] **Step 2: 写 `src/vite-env.d.ts`**(让 TS 认识 Vite 的 `?raw` 导入语法)

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 3: 写 `src/content/manifest.ts`**

```ts
import whiteBird from './01-white-bird.script?raw';
import greyRoom from './02-grey-room.script?raw';
import greenDoor from './03-green-door.script?raw';
import blueSea from './04-blue-sea.script?raw';

export const CHAPTERS: Record<string, string> = {
  '一、白色的鸟': whiteBird,
  '二、灰色的屋': greyRoom,
  '三、绿色的门': greenDoor,
  '四、蓝色的海': blueSea,
};

export function loadChapterScript(name: string): string {
  const script = CHAPTERS[name];
  if (script === undefined) throw new Error(`未知章节: "${name}"`);
  return script;
}
```

- [ ] **Step 4: 写 `src/content/manifest.test.ts`,验证迁移没有出错**

```ts
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
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run src/content/manifest.test.ts`
Expected: PASS。如果某一章解析失败,报错会指出具体哪一行——去对照 Step 1 是否抄错/漏抄了字符(最容易出错的是全角/半角标点,以及 `&` 在 `「bots&chips」` 这种正文里出现时不要误当成开头的斜体标记——`&` 标记只在**行首**生效,`parser.ts` 的 `parseTextLine` 只检查 `startsWith`,行中间的 `&` 不受影响,这一点不用额外处理,只是提醒核对抄写没有引入行首意外字符)。

- [ ] **Step 6: Commit**

```bash
git add src/content/ src/vite-env.d.ts
git commit -m "feat: migrate the 4 existing chapters from drama-init.js into src/content/*.script"
```

---

### Task 3: 音效模块(`src/ui/audio.ts`)

**Files:**
- Create: `src/ui/audio.ts`
- Test: `src/ui/audio.test.ts`

**Interfaces:**
- Consumes: 无(浏览器 `Audio`/DOM API)。
- Produces: `type SoundName = 'button01a' | 'button02a' | 'button05' | 'button06'`、`playSound(name: SoundName, volume?: number): void`——Task 4(`dom-ui-port.ts`)和 Task 5(`chrome.ts`)都会用到。

- [ ] **Step 1: 写失败测试 `src/ui/audio.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/ui/audio.test.ts`
Expected: FAIL,找不到模块 `./audio`。

- [ ] **Step 3: 实现 `src/ui/audio.ts`**

```ts
export type SoundName = 'button01a' | 'button02a' | 'button05' | 'button06';

const SOUND_FILES: Record<SoundName, string> = {
  button01a: 'SE/button01a.mp3',
  button02a: 'SE/button02a.mp3',
  button05: 'SE/button05.mp3',
  button06: 'SE/button06.mp3',
};

const players: Partial<Record<SoundName, HTMLAudioElement>> = {};

function getPlayer(name: SoundName): HTMLAudioElement {
  let player = players[name];
  if (!player) {
    player = new Audio(SOUND_FILES[name]);
    players[name] = player;
  }
  return player;
}

export function playSound(name: SoundName, volume = 0.4): void {
  const soundToggle = document.getElementById('turn-sound') as HTMLInputElement | null;
  if (!soundToggle?.checked) return;
  const player = getPlayer(name);
  player.volume = volume;
  void player.play().catch(() => {});
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/ui/audio.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/audio.ts src/ui/audio.test.ts
git commit -m "feat: add sound-effect playback module"
```

---

### Task 4: DOM 渲染层(`src/ui/dom-ui-port.ts`)

**Files:**
- Create: `src/ui/dom-ui-port.ts`
- Test: `src/ui/dom-ui-port.test.ts`

**Interfaces:**
- Consumes: `UIPort`/`TextStyle` from `../engine/ui-port`(Plan 1)、`playSound` from `./audio`(Task 3)。
- Produces: `createDomUIPort(): UIPort`——Task 6(`main.ts`)用它构造真正驱动页面的 `UIPort` 实例。

这是引擎的 `UIPort` 接口在真实 DOM 上的实现,对应现有 `#main-content`(对话/选项区)和 `#head`(头像)两个元素,行为对齐原 `game-engine.js` 的 `pushText`/`pushQuestion`/`waitClick`/`pause`,但**不需要自己解析 `*^&` 标记**——`showText` 收到的 `style` 参数已经是解析好的枚举值,只需要套对应的 CSS class。

- [ ] **Step 1: 写失败测试 `src/ui/dom-ui-port.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDomUIPort } from './dom-ui-port';

function setUpDom(intervalValue: string): void {
  document.body.innerHTML = `
    <div id="main-content"></div>
    <div id="head"></div>
    <input id="interval-range" value="${intervalValue}">
  `;
}

describe('createDomUIPort: showText', () => {
  it('interval为0时,一次性显示完整文本并套上对应class', async () => {
    setUpDom('0');
    await createDomUIPort().showText('你好', 'small');
    const p = document.querySelector('#main-content p')!;
    expect(p.textContent).toBe('你好');
    expect(p.classList.contains('small')).toBe(true);
  });

  it('interval大于0时,逐字显示', async () => {
    setUpDom('10');
    vi.useFakeTimers();
    const done = createDomUIPort().showText('abc', 'normal');
    const p = () => document.querySelector('#main-content p')!;
    expect(p().textContent).toBe('a');
    await vi.advanceTimersByTimeAsync(10);
    expect(p().textContent).toBe('ab');
    await vi.advanceTimersByTimeAsync(10);
    expect(p().textContent).toBe('abc');
    await vi.advanceTimersByTimeAsync(10);
    await done;
    vi.useRealTimers();
  });
});

describe('createDomUIPort: showChoices', () => {
  beforeEach(() => setUpDom('0'));

  it('每个选项生成一个按钮,点击后resolve对应下标', async () => {
    const ui = createDomUIPort();
    const resultPromise = ui.showChoices(['选项A', '选项B']);
    const buttons = document.querySelectorAll('#main-content button');
    expect(buttons).toHaveLength(2);
    (buttons[1] as HTMLButtonElement).click();
    expect(await resultPromise).toBe(1);
  });
});

describe('createDomUIPort: setHead', () => {
  beforeEach(() => setUpDom('0'));

  it('#开头的值设置backgroundColor', () => {
    createDomUIPort().setHead('#4f0');
    const head = document.getElementById('head')!;
    expect(head.style.backgroundColor).not.toBe('');
    expect(head.style.backgroundImage).toBe('');
  });

  it('url开头的值设置backgroundImage', () => {
    createDomUIPort().setHead("url('x.png')");
    const head = document.getElementById('head')!;
    expect(head.style.backgroundImage).toContain('x.png');
  });

  it('空值不生效(保持原样,不清空已有样式)', () => {
    const head = document.getElementById('head')!;
    head.style.backgroundColor = 'red';
    createDomUIPort().setHead('');
    expect(head.style.backgroundColor).toBe('red');
  });
});

describe('createDomUIPort: clearText / pause', () => {
  beforeEach(() => setUpDom('0'));

  it('clearText清空#main-content', () => {
    document.getElementById('main-content')!.innerHTML = '<p>x</p>';
    createDomUIPort().clearText();
    expect(document.getElementById('main-content')!.innerHTML).toBe('');
  });

  it('pause在点击#main-content后resolve,并清空内容', async () => {
    const ui = createDomUIPort();
    document.getElementById('main-content')!.innerHTML = '<p>previous</p>';
    const done = ui.pause();
    (document.getElementById('main-content') as HTMLElement).click();
    await done;
    expect(document.getElementById('main-content')!.innerHTML).toBe('');
  });
});

describe('createDomUIPort: runPuzzle', () => {
  it('还没有谜题框架,调用时抛出清晰错误', async () => {
    await expect(createDomUIPort().runPuzzle('anything')).rejects.toThrow(/谜题/);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/ui/dom-ui-port.test.ts`
Expected: FAIL,找不到模块 `./dom-ui-port`。

- [ ] **Step 3: 实现 `src/ui/dom-ui-port.ts`**

```ts
import type { UIPort, TextStyle } from '../engine/ui-port';
import { playSound } from './audio';

const STYLE_CLASS: Record<TextStyle, string> = {
  normal: 'normal',
  small: 'small',
  big: 'big',
  italic: 'italic',
};

function mainContent(): HTMLElement {
  const el = document.getElementById('main-content');
  if (!el) throw new Error('缺少 #main-content 元素');
  return el;
}

function isAtBottom(): boolean {
  return window.innerHeight + window.scrollY >= document.body.scrollHeight - 1;
}

function scrollToBottomIfNeeded(wasAtBottom: boolean): void {
  if (wasAtBottom) window.scrollTo(0, document.body.scrollHeight);
}

function textIntervalMs(): number {
  const range = document.getElementById('interval-range') as HTMLInputElement | null;
  return range ? Number(range.value) : 60;
}

let clickResolver: (() => void) | null = null;
let choiceButtons: HTMLButtonElement[] = [];

document.addEventListener('keydown', (e) => {
  if (clickResolver && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    const resolve = clickResolver;
    clickResolver = null;
    resolve();
  }
  if (choiceButtons.length > 0 && e.key >= '1' && e.key <= '9') {
    const idx = Number(e.key) - 1;
    if (idx < choiceButtons.length) {
      e.preventDefault();
      choiceButtons[idx].click();
      choiceButtons = [];
    }
  }
});

export function createDomUIPort(): UIPort {
  return {
    async showText(text, style) {
      const wasAtBottom = isAtBottom();
      const el = document.createElement('p');
      el.classList.add(STYLE_CLASS[style]);
      mainContent().appendChild(el);
      scrollToBottomIfNeeded(wasAtBottom);

      const interval = textIntervalMs();
      if (interval === 0) {
        el.textContent = text;
        return;
      }

      el.textContent = text[0] ?? '';
      await new Promise<void>((resolve) => {
        let i = 1;
        const timer = setInterval(() => {
          if (i >= text.length) {
            clearInterval(timer);
            resolve();
            return;
          }
          el.textContent += text[i];
          i++;
        }, interval);
      });
    },

    async showChoices(options) {
      const buttons: HTMLButtonElement[] = [];
      const wasAtBottom = isAtBottom();
      for (const label of options) {
        const el = document.createElement('button');
        el.textContent = label;
        mainContent().appendChild(el);
        mainContent().appendChild(document.createElement('br'));
        buttons.push(el);
      }
      scrollToBottomIfNeeded(wasAtBottom);
      choiceButtons = buttons;
      return new Promise<number>((resolve) => {
        buttons.forEach((button, idx) => {
          button.onclick = () => {
            choiceButtons = [];
            resolve(idx);
          };
        });
      });
    },

    setHead(value) {
      const head = document.getElementById('head');
      if (!head || !value) return;
      head.style.backgroundColor = value.startsWith('#') ? value : '';
      // 和原 game-engine.js 的 !head 处理逻辑完全一致(含它对 "url(...)" 值会套双层
      // url() 的这个既有小怪癖)——现有4章内容只用过 #hex 颜色,从没走到这条分支,
      // 这里只是原样保留未使用过的旧行为,不是这次移植引入的新问题。
      head.style.backgroundImage = value.startsWith('url') ? `url('${value}')` : '';
    },

    clearText() {
      mainContent().innerHTML = '';
    },

    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    async pause() {
      await new Promise<void>((resolve) => {
        clickResolver = resolve;
        mainContent().onclick = () => {
          if (clickResolver) {
            const r = clickResolver;
            clickResolver = null;
            r();
          }
        };
      });
      playSound('button01a');
      mainContent().innerHTML = '';
    },

    async runPuzzle(name) {
      throw new Error(`谜题框架还没实现(计划4),不应该有内容调用 !puzzle "${name}"`);
    },
  };
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/ui/dom-ui-port.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/dom-ui-port.ts src/ui/dom-ui-port.test.ts
git commit -m "feat: implement UIPort against the real DOM"
```

---

### Task 5: 页面外壳(`src/ui/chrome.ts`)

**Files:**
- Create: `src/ui/chrome.ts`
- Test: `src/ui/chrome.test.ts`

**Interfaces:**
- Consumes: `playSound` from `./audio`(Task 3)、`loadGame`/`saveGame`/`SaveSlot` from `../engine/save`(Plan 1)、`SaveData` from `../engine/state`(Plan 1)。
- Produces: `zfill(value, width?): string`、`changeState(id: string, forceHide?: boolean): void`、`shake(): void`、`initChrome(): void`、`renderFilePage(mode: 'save' | 'load', onLoad: (data: SaveData) => void, onSave: (slot: SaveSlot) => void): void`——Task 6(`main.ts`)用这些函数接管 `index.html` 里原来由 `ee-main.js`/`game-engine.js` 提供的所有非剧情页面行为(窗口拖拽、设置开关、state面板、时间、存读档面板)。

这是从 `ee-main.js`(窗口拖拽/设置/state面板/时间/shake/标题彩蛋)和 `game-engine.js` 的 `fileSaveLoad`(存读档面板,改造成回调式,不再直接调用旧的 `load`/`save`/`parseLine`)移植过来的逻辑。**这是移植,不是重新设计**——除了 `fileSaveLoad` 因为要接新的存档模型而必须改造成回调形式之外,其它函数尽量保持原来的行为,包括一些看起来"不对称"但其实是有意为之的细节(比如 `changeSwitch` 的默认值判断逻辑——阅读旧 `ee-main.js` 里对应函数,照抄语义,不要"顺手修正")。

- [ ] **Step 1: 写失败测试 `src/ui/chrome.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/ui/chrome.test.ts`
Expected: FAIL,找不到模块 `./chrome`。

- [ ] **Step 3: 实现 `src/ui/chrome.ts`**

```ts
import { playSound } from './audio';
import { loadGame, saveGame, type SaveSlot } from '../engine/save';
import type { SaveData } from '../engine/state';

export function zfill(value: number | string, width = 2): string {
  let str = String(value);
  while (str.length < width) str = `0${str}`;
  return str;
}

const visibility: Record<string, boolean> = { window: true, state: false };

export function changeState(id: string, forceHide = false): void {
  playSound('button05', 1);
  const el = document.querySelector(`#${id}`) as HTMLElement | null;
  if (el) el.style.display = forceHide || visibility[id] ? 'none' : 'block';

  if (id === 'file-page') {
    const boxes = Array.from(document.getElementsByClassName('box')) as HTMLElement[];
    boxes.forEach((box) => {
      box.onclick = null;
      box.style.display = 'block';
    });
  }

  visibility[id] = !visibility[id];
}

export function shake(): void {
  playSound('button05', 1);
  const body = document.getElementById('window');
  body?.classList.add('shake-window');
  setTimeout(() => body?.classList.remove('shake-window'), 1000);
}

function moveWindow(): void {
  const header = document.getElementById('window-header');
  const dock = document.getElementById('dock-window') as HTMLInputElement | null;
  if (header) header.style.cursor = dock?.checked ? 'default' : 'move';
}

function changeSwitch(id: string, defaultValue: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.onchange = (e) => {
    localStorage.setItem(id, String((e.target as HTMLInputElement).checked));
    if (id === 'dock-window') moveWindow();
  };
  // 和原 ee-main.js 一样:只有当本地存储的值恰好等于这个默认值时才应用它——
  // 这不是bug,HTML本身的checked属性已经覆盖了"没有相反记录"的情况。
  if (localStorage.getItem(id) === String(defaultValue)) el.checked = defaultValue;
}

function changeInterval(): void {
  const range = document.getElementById('interval-range') as HTMLInputElement | null;
  const num = document.getElementById('interval-num');
  if (!range || !num) return;
  num.textContent = range.value;
  localStorage.setItem('interval-num', range.value);
}

function dragWindow(): void {
  const el = document.getElementById('window');
  const header = document.getElementById('window-header');
  if (!el) return;

  const saved = localStorage.getItem('save-position');
  if (saved) {
    const [top, left] = saved.split(' ');
    el.style.top = `${top || 0}px`;
    el.style.left = `${left || 0}px`;
  }

  let lastX = 0;
  let lastY = 0;

  function dragMouseDown(e: MouseEvent): void {
    e.preventDefault();
    lastX = e.clientX;
    lastY = e.clientY;
    document.onmouseup = closeDragWindow;
    document.onmousemove = windowDrag;
  }

  function windowDrag(e: MouseEvent): void {
    const dock = document.getElementById('dock-window') as HTMLInputElement | null;
    if (dock?.checked || !el) return;
    e.preventDefault();
    const dx = lastX - e.clientX;
    const dy = lastY - e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
    const newTop = Math.max(0, Math.min(el.offsetTop - dy, window.innerHeight - el.offsetHeight - 41));
    const newLeft = Math.max(0, Math.min(el.offsetLeft - dx, window.innerWidth - el.offsetWidth));
    el.style.top = `${newTop}px`;
    el.style.left = `${newLeft}px`;
    localStorage.setItem('save-position', `${newTop} ${newLeft}`);
  }

  function closeDragWindow(): void {
    document.onmouseup = null;
    document.onmousemove = null;
  }

  (header ?? el).onmousedown = dragMouseDown;
}

function startTime(): void {
  const el = document.getElementById('time')?.firstChild;
  if (el) {
    const now = new Date();
    el.textContent = `${now.getFullYear()}.${zfill(now.getMonth() + 1)}.${zfill(now.getDate())} ${zfill(now.getHours())}:${zfill(now.getMinutes())}:${zfill(now.getSeconds())}`;
  }
  setTimeout(startTime, 1000);
}

export function initChrome(): void {
  changeSwitch('dock-window', true);
  changeSwitch('turn-sound', false);
  changeSwitch('turn-auto', false);

  const rangeEl = document.getElementById('interval-range') as HTMLInputElement | null;
  rangeEl?.addEventListener('input', changeInterval);

  const numEl = document.getElementById('interval-num');
  const savedInterval = localStorage.getItem('interval-num');
  if (savedInterval && numEl && rangeEl) {
    numEl.textContent = savedInterval;
    rangeEl.value = savedInterval;
  }

  document.addEventListener('visibilitychange', () => {
    document.title = document.visibilityState === 'hidden' ? 'BUGLAND｜PAPEREE' : 'UWULAND｜PAPEREE';
  });

  startTime();
  moveWindow();
  dragWindow();
}

function formatSaveSummary(data: SaveData): string {
  return `<p><u>Data</u>: ${data.chapter}</br><u>Pace</u>: ${zfill(data.pauseIndex, 3)}</br><u>Time</u>: ${data.time}</p>`;
}

export function renderFilePage(
  mode: 'save' | 'load',
  onLoad: (data: SaveData) => void,
  onSave: (slot: SaveSlot) => void,
): void {
  changeState('file-page', false); // 内部会重置所有 .box 的 onclick/display

  const boxes = Array.from(document.getElementsByClassName('box')) as HTMLElement[];
  boxes.forEach((box, index) => {
    const slot = box.id as SaveSlot;
    const summaryEl = document.querySelector(`#${slot}-save`);
    if (!summaryEl) return;
    const data = loadGame(slot);
    summaryEl.innerHTML = data ? formatSaveSummary(data) : `<p class="oops">Not Data</p>`;

    if (data && mode === 'load') {
      box.onclick = () => {
        onLoad(data);
        changeState('home', true);
        changeState('file-page', true);
      };
    } else if (mode === 'save') {
      if (index === 0) {
        box.style.display = 'none';
      } else {
        box.onclick = () => {
          onSave(slot);
          const refreshed = loadGame(slot);
          if (refreshed) summaryEl.innerHTML = formatSaveSummary(refreshed);
        };
      }
    }
  });
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/ui/chrome.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/chrome.ts src/ui/chrome.test.ts
git commit -m "feat: port window chrome, settings, and save/load panel to TS"
```

---

### Task 6: 应用入口 + `index.html` 接线 + 删除旧文件

**Files:**
- Create: `src/main.ts`
- Modify: `index.html`
- Modify: `package.json`(补 `dev`/`build`/`preview` 脚本)
- Delete: `game-engine.js`
- Delete: `ee-main.js`
- Delete: `drama-init.js`

**Interfaces:**
- Consumes: 本计划 Task 1-5 的全部导出。
- Produces: 一个真正能跑的页面。这是本计划最后一个写代码的任务,没有下游任务消费它的导出。

**Step 1: 给 `index.html` 里需要用 JS 接管交互的元素补上 id,去掉内联 `onclick`**

现有 `index.html` 里很多可点击元素用的是 `onclick="changeState(...)"` 这种内联写法,调用的是全局函数。新代码是走 ES module 打包的,不适合再往 `window` 上挂一堆全局函数。改成:保留原有的可见结构/文案/class 不变,把内联 `onclick` 换成 `id`,由 `main.ts` 里用 `addEventListener` 接管。具体改动(只改这几处,其它一律不动):

- `#home` 里 4 个菜单项 `<p>`:Start 加 `id="start-button"`,Load 加 `id="home-load-button"`,Set 加 `id="home-set-button"`,About 加 `id="home-about-button"`,同时删掉它们的 `onclick`。
- `#about`/`#setting`/`#file-page` 里的返回箭头 `<span>❮</span>`:分别加 `id="about-back"`、`id="setting-back"`、`id="file-page-back"`,删掉 `onclick`。
- `#msg-box` 的 `.tool` 里 5 个 `<span>`(Home/Save/Load/Set/About):分别加 `id="tool-home"`、`id="tool-save"`、`id="tool-load"`、`id="tool-set"`、`id="tool-about"`,删掉 `onclick`。
- `#interval-range` 的 `oninput="changeInterval()"` 删掉(`chrome.ts` 的 `initChrome()` 已经用 `addEventListener('input', ...)` 接管)。
- `#hide`/`#kick`/`#thumbnail`/`#menu`/`#close` 已经有 id 了,只删 `onclick` 即可。

页面底部的 `<script>` 标签:

```html
<script type="module" src="/src/main.ts"></script>
```

替换掉原来的 `<script src="drama-init.js"></script>`、`<script src="game-engine.js"></script>`、`<script src="ee-main.js"></script>` 三行。

State 面板里的引擎署名顺带更新(内容不影响功能,合理即可,例如把 `<u>Engine</u>: game-engine` 改成 `<u>Engine</u>: uwuland-engine v2(TS重写)`,PAPEREE 的署名保留不动)。

**Step 2: 写 `src/main.ts`**

```ts
import { createDomUIPort } from './ui/dom-ui-port';
import { initChrome, changeState, shake, renderFilePage } from './ui/chrome';
import { loadChapterScript } from './content/manifest';
import { startChapter, resumeChapter } from './engine/driver';
import { GameState } from './engine/state';
import { saveGame, loadGame, type SaveSlot } from './engine/save';
import type { ScriptResult } from './engine/interpreter';
import type { SaveData } from './engine/state';

const FIRST_CHAPTER = '一、白色的鸟';
const ui = createDomUIPort();
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
```

**Step 3: 给 `package.json` 补构建脚本**

在 `scripts` 里加(保留已有的 `test`):

```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview"
```

**Step 4: 删除旧引擎文件**

```bash
git rm game-engine.js ee-main.js drama-init.js
```

**Step 5: 跑构建和测试,确认没有破坏任何东西**

Run: `npm test` — Expected: 全部通过(Task 1-6 累计的所有测试)。
Run: `npx tsc --noEmit` — Expected: 干净。
Run: `npm run build` — Expected: 成功生成 `dist/`,无报错。

**Step 6: Commit**

```bash
git add index.html package.json src/main.ts
git commit -m "feat: wire up main.ts, replace game-engine.js/ee-main.js/drama-init.js"
```

---

## 完成后

`npm run dev` 应该能打开一个和现在线上版本视觉、交互一致的桌面页面,可以完整玩通4章内容、存读档、改设置、拖拽窗口。这一步完成后需要**实际启动 dev server,在浏览器里走一遍完整流程**(Start→4章内容→触发`!pick`分支→Save→刷新页面→Load→确认续读位置正确→测试设置面板/about页面/窗口拖拽/关闭动画),再宣布本计划完成——这一步不是自动化测试能替代的。

下一份计划(移动端响应式布局)会在保留这套 `src/ui/` 结构的基础上,把 `style.css` 改成响应式,并给 `dom-ui-port.ts`/`chrome.ts` 需要的地方加移动端专属渲染分支。
