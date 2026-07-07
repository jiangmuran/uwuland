# UWULAND 谜题框架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给引擎已有的 `!puzzle` 指令接上真正的互动谜题UI(不再是空接口报错),并把第三章"Base64解密"那段从"点选项直接给答案"改造成玩家真正需要动手解密的互动谜题。

**Architecture:** `src/ui/puzzles/` 下新增一个轻量注册表:每个谜题是一个"给定容器DOM+参数字符串+resolve回调,自己管生命周期"的挂载函数,`!puzzle <类型>:<参数>` 里的 `<类型>` 决定用哪个挂载函数,`<参数>` 原样传给它。`dom-ui-port.ts` 的 `runPuzzle` 从"直接抛错"改成委托给这个注册表,谜题UI渲染在现有的 `#main-content` 对话区里,不新增任何弹窗/遮罩,视觉上和对话/选项是同一套东西。

**Tech Stack:** 纯 TypeScript + DOM,不引入新依赖。

## Global Constraints

- 不引入 React/Vue 等框架,不新增运行时依赖。
- **这次不碰 `src/engine/` 任何文件**——`!puzzle` 指令的解析(`parser.ts`)和执行(`interpreter.ts` 调用 `ui.runPuzzle(name)` 并把返回值合并进变量)在 Plan 1 就已经做完了,这次只实现 `UIPort.runPuzzle` 具体怎么渲染。
- **谜题必须是章节的收尾动作,后面不能再跟 `!pause`**——这不是技术上强制校验的规则,是写内容时必须遵守的约定。原因:续读存档靠"从章节入口静默重放到暂停点"实现,而 `wrapForResume` 不会静默跳过 `!puzzle`(它是真实的用户交互,没法自动重放)。只要谜题后面紧跟着章节收尾的 `!load`/`!pick`/`!exit`,中间没有 `!pause`,就永远不会有"存档点在谜题之后"的情况,自然不会触发谜题被迫重放。这次改造第三章时会遵守这一条,以后加新谜题也要遵守。
- 视觉上复用现有的 `--ink`/`--accent` 令牌和现有字体/边框风格,不新增视觉语言。
- 移动端(Plan 3)的响应式框架已经就位,新增的谜题输入框/按钮要在现有断点下不溢出,但不需要新增专门的移动端媒体查询——用 `width:100%;box-sizing:border-box` 之类通用写法即可适配。

## 本计划在整体重构中的位置

这是5份顺序计划中的第4份。Plan 1-3(引擎核心、桌面渲染层、移动端响应式布局)都已完成并推送。完成本计划的标志:实际打开游戏玩到第三章结尾,看到的不再是"点一下就给答案"的按钮,而是一个真的需要输入解码结果的输入框,猜错能重试、多次错了给提示,猜对了才能进入第四章。

Plan 5(剧情内容强化)在这之后,会往其它章节里加好感度/背包机制,和谜题框架没有直接依赖关系,但如果以后想加新谜题,直接在 `src/ui/puzzles/` 下加一个新的挂载函数、注册进 Task 2 的注册表即可,不需要动引擎或者这次写的其它文件。

---

### Task 1: 谜题类型定义 + Base64解密谜题

**Files:**
- Create: `src/ui/puzzles/types.ts`
- Create: `src/ui/puzzles/base64-decode.ts`
- Test: `src/ui/puzzles/base64-decode.test.ts`
- Modify: `style.css`(给谜题输入框/按钮加样式)

**Interfaces:**
- Produces: `type PuzzleResult = Record<string, number | boolean>`、`interface PuzzleContext { container: HTMLElement; param: string; resolve: (result: PuzzleResult) => void }`、`type PuzzleMounter = (ctx: PuzzleContext) => void`、`mountBase64Decode: PuzzleMounter`——Task 2(注册表)会导入 `mountBase64Decode` 并注册成 `"base64decode"` 类型。

- [ ] **Step 1: 写 `src/ui/puzzles/types.ts`**

```ts
export type PuzzleResult = Record<string, number | boolean>;

export interface PuzzleContext {
  container: HTMLElement;
  param: string;
  resolve: (result: PuzzleResult) => void;
}

export type PuzzleMounter = (ctx: PuzzleContext) => void;
```

- [ ] **Step 2: 写失败测试 `src/ui/puzzles/base64-decode.test.ts`**

```ts
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
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `npx vitest run src/ui/puzzles/base64-decode.test.ts`
Expected: FAIL,找不到模块 `./base64-decode`。

- [ ] **Step 4: 实现 `src/ui/puzzles/base64-decode.ts`**

```ts
import type { PuzzleContext } from './types';

const HINT_AFTER_ATTEMPTS = 3;

export function mountBase64Decode({ container, param, resolve }: PuzzleContext): void {
  let correctAnswer: string;
  try {
    correctAnswer = atob(param);
  } catch {
    container.innerHTML = '';
    const error = document.createElement('p');
    error.textContent = `谜题配置错误:"${param}" 不是合法的 Base64`;
    container.appendChild(error);
    return;
  }

  container.innerHTML = '';

  const prompt = document.createElement('p');
  prompt.textContent = `密文:${param}`;
  container.appendChild(prompt);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'puzzle-input';
  input.placeholder = '解密后的内容是……';
  container.appendChild(input);
  container.appendChild(document.createElement('br'));

  const submit = document.createElement('button');
  submit.textContent = '提交';
  container.appendChild(submit);

  const feedback = document.createElement('p');
  feedback.className = 'puzzle-feedback';
  container.appendChild(feedback);

  let attempts = 0;

  function trySubmit(): void {
    attempts++;
    if (input.value.trim() === correctAnswer) {
      feedback.textContent = '解密成功！';
      submit.disabled = true;
      input.disabled = true;
      setTimeout(() => resolve({ success: true, attempts }), 500);
      return;
    }
    feedback.textContent =
      attempts >= HINT_AFTER_ATTEMPTS
        ? '还不对……提示:这是标准 Base64 编码,试试网上的在线解码工具。'
        : `不对哦,再想想?(第 ${attempts} 次尝试)`;
  }

  submit.onclick = trySubmit;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trySubmit();
    }
  });
}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run src/ui/puzzles/base64-decode.test.ts`
Expected: PASS。

- [ ] **Step 6: 给谜题UI加样式**

在 `style.css` 末尾(现有移动端 `@media` 块**外面**,这是桌面/移动通用的基础样式,不是断点相关的覆盖规则)追加:

```css
.puzzle-input {
    display: block;
    width: 100%;
    max-width: 300px;
    box-sizing: border-box;
    margin: 10px 0;
    padding: 6px 10px;
    border: solid 2px var(--ink);
    background-color: white;
}

.puzzle-feedback {
    min-height: 1.2em;
}
```

- [ ] **Step 7: 跑构建确认没有语法错误**

Run: `npx vite build`
Expected: 成功。

- [ ] **Step 8: Commit**

```bash
git add src/ui/puzzles/types.ts src/ui/puzzles/base64-decode.ts src/ui/puzzles/base64-decode.test.ts style.css
git commit -m "feat: add puzzle types and the Base64-decode puzzle"
```

---

### Task 2: 谜题注册表

**Files:**
- Create: `src/ui/puzzles/registry.ts`
- Test: `src/ui/puzzles/registry.test.ts`

**Interfaces:**
- Consumes: `mountBase64Decode` from `./base64-decode`(Task 1)、`PuzzleContext`/`PuzzleMounter`/`PuzzleResult` from `./types`(Task 1)。
- Produces: `runPuzzle(name: string, container: HTMLElement): Promise<PuzzleResult>`——Task 3(`dom-ui-port.ts`)会直接调用这个函数实现 `UIPort.runPuzzle`。`name` 的格式是 `"<谜题类型>:<参数>"`(比如 `"base64decode:aGVsbG8="`);没有冒号时整个字符串当类型,参数为空字符串。

- [ ] **Step 1: 写失败测试 `src/ui/puzzles/registry.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/ui/puzzles/registry.test.ts`
Expected: FAIL,找不到模块 `./registry`。

- [ ] **Step 3: 实现 `src/ui/puzzles/registry.ts`**

```ts
import type { PuzzleMounter, PuzzleResult } from './types';
import { mountBase64Decode } from './base64-decode';

const PUZZLES: Record<string, PuzzleMounter> = {
  base64decode: mountBase64Decode,
};

export function runPuzzle(name: string, container: HTMLElement): Promise<PuzzleResult> {
  const sep = name.indexOf(':');
  const type = sep === -1 ? name : name.slice(0, sep);
  const param = sep === -1 ? '' : name.slice(sep + 1);

  const mounter = PUZZLES[type];
  if (!mounter) {
    return Promise.reject(new Error(`未知谜题类型: "${type}"(完整名称: "${name}")`));
  }

  return new Promise((resolve) => {
    mounter({ container, param, resolve });
  });
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/ui/puzzles/registry.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/puzzles/registry.ts src/ui/puzzles/registry.test.ts
git commit -m "feat: add puzzle registry dispatching by type:param name"
```

---

### Task 3: 接入 `dom-ui-port.ts`

**Files:**
- Modify: `src/ui/dom-ui-port.ts`
- Modify: `src/ui/dom-ui-port.test.ts`

**Interfaces:**
- Consumes: `runPuzzle` from `./puzzles/registry`(Task 2)。
- Produces: `UIPort.runPuzzle` 的真实实现(替换掉 Plan 2 留下的"还没实现"占位)。

- [ ] **Step 1: 读现有的 `src/ui/dom-ui-port.ts` 和 `src/ui/dom-ui-port.test.ts`**

找到当前的 `runPuzzle` 实现(现在应该是直接 `throw new Error(...)`)和它对应的测试(现在断言"调用时抛出清晰错误,错误信息含'谜题'字样")。

- [ ] **Step 2: 更新测试**

把现有的 `describe('createDomUIPort: runPuzzle', ...)` 块整体替换成:

```ts
describe('createDomUIPort: runPuzzle', () => {
  beforeEach(() => setUpDom('0'));

  it('委托给谜题注册表,真正的谜题结果会被返回', async () => {
    vi.useFakeTimers();
    const ui = createDomUIPort();
    const promise = ui.runPuzzle('base64decode:aGVsbG8=');
    const input = document.querySelector('#main-content input') as HTMLInputElement;
    input.value = 'hello';
    (document.querySelector('#main-content button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toEqual({ success: true, attempts: 1 });
    vi.useRealTimers();
  });

  it('未注册的谜题类型时,Promise reject 并带清晰错误信息(不再是"还没实现"占位,是真实的注册表校验)', async () => {
    const ui = createDomUIPort();
    await expect(ui.runPuzzle('不存在的谜题类型')).rejects.toThrow(/谜题/);
  });
});
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `npx vitest run src/ui/dom-ui-port.test.ts`
Expected: FAIL(第一个新测试会失败,因为 `runPuzzle` 还是旧的占位实现)。

- [ ] **Step 4: 实现**

在文件顶部加上 import(用别名,避免和 `UIPort.runPuzzle` 这个方法名撞掉):

```ts
import { runPuzzle as dispatchPuzzle } from './puzzles/registry';
```

把 `dom-ui-port.ts` 里 `runPuzzle` 方法的实现从:

```ts
async runPuzzle(name) {
  throw new Error(`谜题框架还没实现(计划4),不应该有内容调用 !puzzle "${name}"`);
},
```

改成:

```ts
runPuzzle(name) {
  return dispatchPuzzle(name, mainContent());
},
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run src/ui/dom-ui-port.test.ts`
Expected: PASS。

- [ ] **Step 6: 跑完整测试套件**

Run: `npm test` — Expected: 全部通过。
Run: `npx tsc --noEmit` — Expected: 干净。

- [ ] **Step 7: Commit**

```bash
git add src/ui/dom-ui-port.ts src/ui/dom-ui-port.test.ts
git commit -m "feat: wire dom-ui-port's runPuzzle to the real puzzle registry"
```

---

### Task 4: 改造第三章内容

**Files:**
- Modify: `src/content/03-green-door.script`
- Modify: `src/content/manifest.test.ts`

**Interfaces:**
- 无新增导出。这个任务只改剧情文本,让它真正用上前三个任务做好的谜题机制。

现有 `src/content/03-green-door.script` 的最后两行是:

```
所以，解码的结果是？
!pick 「bots&chips」 四、蓝色的海
```

（`!pick` 的选项文字直接把答案摆出来给玩家点,等于没有谜题。）

- [ ] **Step 1: 把这两行改成**

```
所以，解码的结果是？
!puzzle base64decode:Ym90cyBhbmQgY2hpcHM=
!load 四、蓝色的海
```

`Ym90cyBhbmQgY2hpcHM=` 和原来 `!pick` 里显示的密文是同一串字符——但实际解码结果是 `bots and chips`(带空格、and拼全),不是原来按钮上写的 `bots&chips`。原作者当年那个按钮标签看来是密文的一个简化/双关写法,不是密文的真实解码结果,以前只是个不校验的装饰性按钮所以没人注意到;现在谜题真的要校验解码结果,玩家需要输入的正确答案是 `bots and chips`。谜题成功后直接 `!load` 到第四章,不再需要 `!pick` 那层——玩题解出来本身就是唯一的"选择"。**谜题和章节收尾之间不能插入 `!pause`**(见本计划 Global Constraints 里对续读存档的说明),改完之后确认这两行之间、以及`!puzzle`到文件末尾之间都没有 `!pause`。

- [ ] **Step 2: 更新 `manifest.test.ts` 里对应的断言**

现有这个测试(检查第三章结尾跳转)：

```ts
it('三、绿色的门 结尾正确跳转到四、蓝色的海', () => {
  const nodes = parseScript(CHAPTERS['三、绿色的门']);
  const last = nodes[nodes.length - 1];
  expect(last.kind).toBe('pick');
  if (last.kind === 'pick') expect(last.targets).toEqual(['四、蓝色的海']);
});
```

改成:

```ts
it('三、绿色的门 结尾是谜题,解密成功后跳转到四、蓝色的海', () => {
  const nodes = parseScript(CHAPTERS['三、绿色的门']);
  const puzzleIndex = nodes.findIndex((n) => n.kind === 'puzzle');
  expect(puzzleIndex).toBeGreaterThan(-1);
  const puzzleNode = nodes[puzzleIndex];
  if (puzzleNode.kind === 'puzzle') expect(puzzleNode.name).toBe('base64decode:Ym90cyBhbmQgY2hpcHM=');

  const last = nodes[nodes.length - 1];
  expect(last.kind).toBe('load');
  if (last.kind === 'load') expect(last.target).toBe('四、蓝色的海');

  // 谜题和章节收尾之间不能有 !pause(见本计划 Global Constraints)
  const nodesAfterPuzzle = nodes.slice(puzzleIndex + 1);
  expect(nodesAfterPuzzle.some((n) => n.kind === 'pause')).toBe(false);
});
```

- [ ] **Step 3: 跑测试,确认通过**

Run: `npx vitest run src/content/manifest.test.ts`
Expected: PASS。

- [ ] **Step 4: 跑完整测试套件和构建**

Run: `npm test` — Expected: 全部通过。
Run: `npx tsc --noEmit` — Expected: 干净。
Run: `npx vite build` — Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add src/content/03-green-door.script src/content/manifest.test.ts
git commit -m "feat: turn chapter 3's Base64 reveal into a real interactive puzzle"
```

---

## 完成后(人工验证,不委派给subagent)

启动 `npm run dev`,从存档或者直接改 `main.ts` 里的起始章节(临时改,验证完不提交)跳到第三章,实际走一遍:

- 谜题UI是否正确显示密文、输入框、提交按钮。
- 故意输错2次,确认能重试、每次提示"第N次尝试"。
- 第3次错误时,确认提示文案里出现"提示"字样。
- 输入正确答案(`bots and chips`,注意带空格、and拼全,不是原按钮上的`bots&chips`),确认显示"解密成功"并自动跳转到第四章。
- 确认整个过程控制台没有报错,移动端视口下输入框/按钮没有溢出。
- 确认桌面端其它页面(设置/关于/存读档)没有因为这次改动受影响。

全部通过后本计划才算完成。
