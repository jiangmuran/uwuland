import { playSound } from './audio';
import { loadGame, type SaveSlot } from '../engine/save';
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

const MOBILE_MEDIA_QUERY = '(max-width: 792px), (max-height: 544px)';

export function isMobileLayout(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function dragWindow(): void {
  if (isMobileLayout()) return;
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
