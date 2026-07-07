import type { UIPort, TextStyle } from '../engine/ui-port';
import { playSound } from './audio';
import { runPuzzle as dispatchPuzzle } from './puzzles/registry';

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

export function createDomUIPort(onPause: () => void = () => {}): UIPort {
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

    announceChapter(name) {
      // 忠实移植原 game-engine.js 的 loadText 标题逻辑:填入标题、加 .title 类触发
      // style.css 里已定义好的 3 秒淡出动画、显示,再在 3000ms 后隐藏并移除该类。
      const title = document.getElementById('title');
      const heading = document.querySelector('#title h1');
      if (!title || !heading) return;
      heading.textContent = name;
      title.classList.add('title');
      title.style.display = 'block';
      setTimeout(() => {
        title.style.display = 'none';
        title.classList.remove('title');
      }, 3000);
    },

    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    async pause() {
      // 和原 game-engine.js 的 parseLine 一致:自动存档发生在"等待点击"之前,
      // 而不是之后——这样即便玩家在未点击的暂停画面上直接关掉标签页,也已在此存档。
      onPause();
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

    runPuzzle(name) {
      return dispatchPuzzle(name, mainContent());
    },
  };
}
