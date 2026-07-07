# UWULAND 移动端响应式布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现在硬编码像素坐标的桌面专属CSS,重构成桌面/移动端共享同一套视觉token的响应式布局,彻底移除"屏幕太小就报错拦截"的逻辑,手机上能完整玩通游戏。

**Architecture:** `style.css` 顶部新增 `:root` 设计令牌(品牌色/字体栈),桌面端现有规则原样保留只是引用令牌;同一断点(`max-width:792px` 或 `max-height:544px`,和现在报错拦截用的断点完全一致)下新增一套 `@media` 规则,把仿桌面窗口切换成原生全屏布局。`index.html` 只做两处必要的最小结构调整(删掉`#small-screen`报错div;给`#head`+`.content`包一层新的`#dialogue-row`容器,方便移动端把两者排成横向flex——这层容器对桌面端完全透明,不影响现有绝对定位)。`src/ui/chrome.ts` 补一个`isMobileLayout()`判断,移动端下完全跳过窗口拖拽逻辑(含位置恢复),避免内联`style.top/left`覆盖掉移动端`inset:0`的CSS。

**Tech Stack:** 纯CSS + TypeScript(`window.matchMedia`),不引入任何新依赖。

## Global Constraints

- 不引入 React/Vue 等框架,不新增运行时依赖。
- 断点固定沿用现在的 `(max-width: 792px) or (max-height: 544px)`,和原来触发报错拦截的断点完全一致——只是行为从"隐藏游戏、显示报错"变成"启用移动端布局"。
- 颜色(`#7D5A30`描边、`#eDcAa0`点缀)、字体栈、圆角形状、现有动画(shake/blink-caret/bit-shake/title渐隐)保持不变,桌面端和移动端共用同一套token,不是重新设计视觉风格。
- 桌面端在这次改动前后视觉必须保持像素级一致(这是重构令牌,不是重新设计桌面UI)。
- `src/engine/`、`src/content/`、剧情内容、存档格式这次都不碰。
- **CSS/响应式布局类的任务在这个技术栈下没有真正意义上的自动化测试**——项目用 Vitest + happy-dom,happy-dom 不会真正按视口宽度求值 `@media` 规则,所以"这段CSS在真实手机宽度下是否好看"这件事没法用现有测试工具验证。这几个任务里,实现者要做的是仔细核对CSS改动本身的正确性(选择器、值、不要碰不该碰的规则),真正的可视化验证在全部任务完成后由人工过一遍浏览器(含真实手机视口尺寸)来做,不是每个任务自己去搭浏览器测试。

## 本计划在整体重构中的位置

这是5份顺序计划中的第3份。Plan 1(引擎核心)、Plan 2(桌面渲染层)已完成——`game-engine.js`/`ee-main.js`/`drama-init.js`已被`src/engine/`+`src/ui/`+`src/content/`+`src/main.ts`完全取代,桌面端跑通。完成本计划的标志:同一份代码在桌面视口下和之前视觉一致,在手机视口下(例如375×667)能完整玩通开局→剧情→存读档→设置,不再触发"屏幕太小"报错。

Plan 4(谜题框架)、Plan 5(内容强化)在这之后,和移动端布局没有直接依赖关系。

---

### Task 1: CSS 设计令牌 + 移除小屏幕拦截

**Files:**
- Modify: `style.css`
- Modify: `index.html`

**Interfaces:**
- Produces: `:root` 里的 `--ink`、`--accent`、`--font-stack` 三个CSS自定义属性,供 Task 2/3 的移动端规则和桌面端现有规则共同引用。

- [ ] **Step 1: 在 `style.css` 文件最顶部(第一行之前)插入设计令牌**

```css
:root {
    --ink: #7D5A30;
    --accent: #eDcAa0;
    --font-stack: "Consolas","Microsoft Yahei UI","Microsoft YaHei","Yu Gothic Medium";
}
```

- [ ] **Step 2: 把全文所有 `#7D5A30`、`#eDcAa0`、字体栈字符串的字面量替换成对应的 `var(...)` 引用**

在 `style.css` 里(除了刚加的 `:root` 块本身):
- 把每一处 `#7D5A30`(不区分它出现在 `color`/`border`/`background-color`/`background`/`text-shadow` 等哪个属性里)替换成 `var(--ink)`。
- 把每一处 `#eDcAa0` 替换成 `var(--accent)`。
- 把 `* { font-family: "Consolas","Microsoft Yahei UI","Microsoft YaHei","Yu Gothic Medium"; ... }` 里的字体栈值替换成 `var(--font-stack)`。

**不要改动任何其它值**(圆角、宽高、padding、`white`、`#eee`等一律原样保留),只做这三类字面量到 `var()` 的替换。这是纯令牌抽取,替换前后桌面端渲染效果必须完全一致。

- [ ] **Step 3: 自查替换是否完整**

Run: `grep -n "#7D5A30\|#eDcAa0" style.css`
Expected: 只在 Step 1 新增的 `:root` 块里各出现一次,其它地方都已经替换成 `var(...)`。如果还有遗漏,补上。

Run: `grep -c "Consolas" style.css`
Expected: 恰好1次(只在 `:root` 的 `--font-stack` 定义里)。Step 2 替换后 `*` 规则应该变成 `font-family: var(--font-stack);`,不再包含字面量 `"Consolas"` 字符串。如果这里数出来是2次,说明 `*` 规则那还留着没替换,回去补上。

- [ ] **Step 4: 删除"屏幕太小"报错拦截逻辑**

在 `index.html` 里删除这一段:
```html
    <div id="small-screen">
        <p>Error: 你的屏幕太小了 uwu</p>
    </div>
```

在 `style.css` 里删除这一整段媒体查询(现有代码在文件末尾):
```css
@media screen and ((max-width: 792px) or (max-height: 544px)) {
    #big-screen {
        display: none;
    }

    #small-screen {
        display: block;
    }
}
```

同时删除 `style.css` 里 `#small-screen` 自己的样式规则(如果有单独定义的话,和上面这个媒体查询块一起清理干净;`#big-screen`本身的选择器如果只在这个媒体查询里出现过,也一并删除,但不要动 `#big-screen` 元素本身在 `index.html` 里的存在——它是整个游戏的容器,后面任务还要用)。

- [ ] **Step 5: 手动确认桌面视觉没有变化,新增文件没有语法错误**

Run: `npx vite build` (在项目根目录) — Expected: 构建成功,无报错(这一步只能确认CSS语法/构建没坏,视觉一致性留给本计划最后的人工浏览器验证)。

- [ ] **Step 6: Commit**

```bash
git add style.css index.html
git commit -m "feat: extract CSS design tokens, remove small-screen error block"
```

---

### Task 2: 移动端窗口外壳与对话/选项布局

**Files:**
- Modify: `index.html`(给 `#head` 和 `#main-content` 包一层 `#dialogue-row`)
- Modify: `style.css`(新增移动端 `@media` 规则)

**Interfaces:**
- Consumes: Task 1 的 `--ink`/`--accent` 令牌。
- Produces: 移动端下 `#window`/`#window-header`/`#dialogue-row`/`#head`/`.content`/`.tool` 的响应式布局规则,供 Task 3 的面板类规则和最后的人工验证使用。

- [ ] **Step 1: 给 `#head` 和 `#main-content` 包一层容器**

在 `index.html` 里,把:

```html
            <div id="msg-box" class="uwu">
                <div id="head"></div>
                <div id="main-content" class="content"></div>
                <div class="tool">
```

改成:

```html
            <div id="msg-box" class="uwu">
                <div id="dialogue-row">
                    <div id="head"></div>
                    <div id="main-content" class="content"></div>
                </div>
                <div class="tool">
```

(对应的收尾 `</div>` 也要跟着补一层,确保 `#dialogue-row` 正确闭合在 `.tool` 之前。)

这层新容器本身不设任何桌面端样式,`#head`/`.content` 桌面端仍然是 `position:absolute`,绝对定位会穿透这层非定位的容器,直接相对 `#window` 定位——所以这处HTML改动对桌面端视觉**零影响**,只是给移动端布局提供一个可以用 flex 摆放的钩子。

- [ ] **Step 2: 在 `style.css` 末尾新增移动端媒体查询,覆盖窗口外壳和对话/选项布局**

```css
@media screen and ((max-width: 792px) or (max-height: 544px)) {
    #window {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        border-radius: 0;
    }

    #window-header {
        border-radius: 0;
    }

    .uwu {
        height: calc(100% - 40px);
    }

    #msg-box {
        display: flex;
        flex-direction: column;
        padding: 12px;
        box-sizing: border-box;
    }

    #dialogue-row {
        flex: 1;
        display: flex;
        flex-direction: row;
        gap: 8px;
        min-height: 0;
    }

    #head {
        position: static;
        width: 88px;
        height: 88px;
        flex: none;
        z-index: auto;
    }

    .content {
        position: static;
        flex: 1;
        width: auto;
        max-width: none;
        height: auto;
        max-height: none;
    }

    .content button {
        display: block;
        width: 100%;
        box-sizing: border-box;
        min-height: 44px;
        text-align: left;
        margin: 8px 0;
    }

    .tool {
        position: static;
        transform: none;
        border-bottom: none;
        border-top: 2px solid var(--ink);
        padding-top: 8px;
        margin-top: 8px;
    }
}
```

这段规则只覆盖窗口外壳(`#window`/`#window-header`)和对话/选项区(`#dialogue-row`/`#head`/`.content`/`.tool`)。`#home`/`#about`/`#setting`/`#file-page`/`#state` 内部各自的布局问题留给 Task 3。

- [ ] **Step 3: 确认构建正常**

Run: `npx vite build` — Expected: 成功,无报错。

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: mobile layout for window chrome and dialogue/choice area"
```

---

### Task 3: 移动端各面板布局

**Files:**
- Modify: `style.css`(在 Task 2 新增的同一个移动端 `@media` 块里追加规则)

**Interfaces:**
- Consumes: Task 2 新增的移动端 `@media` 块(在同一个块里追加规则,不要新建第二个媒体查询块)。

现在 `#home`/`#about`/`#setting`/`#file-page` 共享的 `.uwu` 类已经在 Task 2 里适配过高度了,但它们各自内部有些桌面端专属的固定像素定位,在窄屏上会溢出或挤在一起,需要单独覆盖。

- [ ] **Step 1: 在 Task 2 那个移动端 `@media` 块的 `}` 收尾之前,追加以下规则**

```css
    #home h1 {
        font-size: 40px;
    }

    #about-game {
        padding: 24px;
        height: 82%;
    }

    #range {
        position: static;
        width: auto;
        padding: 16px;
        box-sizing: border-box;
    }

    #range p {
        flex-wrap: wrap;
    }

    #file-list {
        flex-direction: column;
        padding-top: 40px;
        margin: 0 16px;
    }

    .box {
        margin: 0 0 16px 0;
    }

    #state {
        max-width: calc(100vw - 20px);
        box-sizing: border-box;
    }
```

- [ ] **Step 2: 确认构建正常**

Run: `npx vite build` — Expected: 成功,无报错。

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: mobile layout for home/about/setting/file-page/state panels"
```

---

### Task 4: 移动端禁用窗口拖拽

**Files:**
- Modify: `src/ui/chrome.ts`
- Modify: `src/ui/chrome.test.ts`

**Interfaces:**
- Produces: `isMobileLayout(): boolean`(通过 `window.matchMedia` 判断当前是否命中移动端断点)。`dragWindow()` 在移动端下整体跳过(包括从 localStorage 恢复窗口位置的逻辑),避免残留的内联 `style.top`/`style.left` 覆盖掉 Task 2 里 CSS 设的 `inset:0`。

**为什么要连位置恢复一起跳过**:如果用户之前在桌面端拖拽过窗口(`localStorage`里存了`save-position`),移动端如果仍然执行"从localStorage恢复位置"这段逻辑,会把 `el.style.top`/`el.style.left` 设成具体像素值——内联样式的优先级高于媒体查询里的CSS规则,会直接把 Task 2 设的 `inset:0` 全屏布局顶掉,导致移动端出现一个歪在某个角落的小窗口。所以移动端下 `dragWindow()` 要整个提前返回,而不是只跳过"绑定拖拽事件"那一半。

- [ ] **Step 1: 写失败测试,追加到 `src/ui/chrome.test.ts` 末尾**

```ts
describe('isMobileLayout / dragWindow 在移动端下的行为', () => {
  function mockMatchMedia(matches: boolean): void {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    // initChrome() 内部会调用 startTime(),它用 setTimeout 递归调度自己;
    // 用 fake timer 避免这个定时器泄漏到后面其它测试里。
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="window"><div id="window-header"></div></div>
      <input id="dock-window" type="checkbox">
    `;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isMobileLayout 直接反映 matchMedia 的结果', () => {
    mockMatchMedia(true);
    expect(isMobileLayout()).toBe(true);
    mockMatchMedia(false);
    expect(isMobileLayout()).toBe(false);
  });

  it('移动端下 initChrome 不会恢复保存的窗口位置,也不会绑定拖拽', () => {
    localStorage.setItem('save-position', '100 200');
    mockMatchMedia(true);
    initChrome();
    const el = document.getElementById('window') as HTMLElement;
    expect(el.style.top).toBe('');
    expect(el.style.left).toBe('');
    expect(document.getElementById('window-header')!.onmousedown).toBeNull();
  });

  it('桌面端下 initChrome 仍然恢复保存的窗口位置并绑定拖拽', () => {
    localStorage.setItem('save-position', '100 200');
    mockMatchMedia(false);
    initChrome();
    const el = document.getElementById('window') as HTMLElement;
    expect(el.style.top).toBe('100px');
    expect(el.style.left).toBe('200px');
    expect(document.getElementById('window-header')!.onmousedown).not.toBeNull();
  });
});
```

同时把 `isMobileLayout` 加进文件顶部从 `./chrome` 的 import 列表里,并确认 `vitest` 的 import 行里有 `afterEach`(现有文件应该已经有 `vi`,只需要补 `afterEach`)。

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/ui/chrome.test.ts`
Expected: FAIL,`isMobileLayout` 未导出 / 不存在。

- [ ] **Step 3: 实现**

在 `src/ui/chrome.ts` 里新增(放在文件里其它函数附近,不需要放在最顶部):

```ts
const MOBILE_MEDIA_QUERY = '(max-width: 792px), (max-height: 544px)';

export function isMobileLayout(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}
```

把现有的 `dragWindow` 函数开头加一行提前返回:

```ts
function dragWindow(): void {
  if (isMobileLayout()) return;
  const el = document.getElementById('window');
  const header = document.getElementById('window-header');
  if (!el) return;

  const saved = localStorage.getItem('save-position');
  ...
```

(函数体剩余部分不变,只是在最前面加了这一行 guard。)

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/ui/chrome.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑完整测试套件**

Run: `npm test` — Expected: 全部通过。
Run: `npx tsc --noEmit` — Expected: 干净。

- [ ] **Step 6: Commit**

```bash
git add src/ui/chrome.ts src/ui/chrome.test.ts
git commit -m "feat: disable window dragging and position restore on mobile layout"
```

---

## 完成后(人工验证,不委派给subagent)

全部4个任务完成后,需要实际启动 `npm run dev`,分别在桌面视口和手机视口(例如375×667的iPhone SE尺寸)下过一遍:

- 桌面视口:确认和Plan 2完成时的视觉、交互没有任何变化(令牌替换是纯重构)。
- 手机视口:确认不再触发"屏幕太小"报错;`Start`→剧情推进→选项按钮→触发`!pick`跳章都能正常操作;`Save`/`Load`/`Set`/`About`四个面板在窄屏下没有横向溢出、内容可读、按钮好点;窗口不能被拖拽;控制台没有报错。

这一步大概率会发现CSS细节需要调整(padding/字号/断行之类),照原计划的思路直接改`style.css`修就行,不需要重新设计。全部通过后才算本计划完成。
