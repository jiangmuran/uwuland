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

  it('url开头的值走图片分支、不被当作背景色(忠实保留原引擎 url() 双层包裹怪癖)', () => {
    createDomUIPort().setHead("url('x.png')");
    const head = document.getElementById('head')!;
    // url 值不是 # 开头,不会被塞进背景色(与上面的 #hex 用例对照,证明确实走了图片分支)
    expect(head.style.backgroundColor).toBe('');
    // 忠实移植 game-engine.js:对以 "url" 开头的值再包一层 -> `url('url('x.png')')`。
    // 这是无效 CSS(嵌套单引号),happy-dom 会丢弃它 -> ''。该分支现有内容从未使用
    // (全是 #hex 颜色),是原引擎既有怪癖,不是本次移植引入的新问题。
    expect(head.style.backgroundImage).toBe('');
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

  it('pause在"等待点击"之前就同步调用onPause(点击前即存档,匹配原引擎时机)', async () => {
    let onPauseCalls = 0;
    const ui = createDomUIPort(() => {
      onPauseCalls++;
    });
    const done = ui.pause();
    // 关键断言:此刻玩家还没点击、pause 也还没 resolve,onPause 就必须已经被调用过。
    // 这证明存档发生在"等待点击"之前而非之后——即使玩家从不点击直接关掉标签页也已存档。
    expect(onPauseCalls).toBe(1);
    (document.getElementById('main-content') as HTMLElement).click();
    await done;
    // 点击并 resolve 之后不应再额外触发一次。
    expect(onPauseCalls).toBe(1);
  });

  it('不传 onPause 时默认无操作,pause 仍正常工作', async () => {
    const ui = createDomUIPort();
    const done = ui.pause();
    (document.getElementById('main-content') as HTMLElement).click();
    await expect(done).resolves.toBeUndefined();
  });
});

describe('createDomUIPort: announceChapter', () => {
  it('填入标题文字、显示 #title 并加 .title 类,3000ms 后隐藏并移除该类', () => {
    vi.useFakeTimers();
    // 复刻 index.html 里既有的 #title 结构(默认 display:none)。
    document.body.innerHTML = `
      <div id="main-content"></div>
      <div id="title" class="uwu" style="display:none"><h1></h1><p>- eebot And FoolishBird's Travel-</p></div>
    `;
    const title = document.getElementById('title') as HTMLElement;
    const heading = document.querySelector('#title h1') as HTMLElement;

    const ui = createDomUIPort();
    // announceChapter 是可选方法,dom 实现里一定存在,用 ! 断言以避免测试被 ?. 静默跳过成空测。
    ui.announceChapter!('一、白色的鸟');

    // 立即:标题文字已填入,#title 显示且带上触发淡出动画的 .title 类。
    expect(heading.textContent).toBe('一、白色的鸟');
    expect(title.style.display).toBe('block');
    expect(title.classList.contains('title')).toBe(true);

    // 动画结束(3000ms)后:隐藏 #title 并移除 .title 类,回到初始状态。
    vi.advanceTimersByTime(3000);
    expect(title.style.display).toBe('none');
    expect(title.classList.contains('title')).toBe(false);

    vi.useRealTimers();
  });
});

describe('createDomUIPort: runPuzzle', () => {
  it('还没有谜题框架,调用时抛出清晰错误', async () => {
    await expect(createDomUIPort().runPuzzle('anything')).rejects.toThrow(/谜题/);
  });
});
