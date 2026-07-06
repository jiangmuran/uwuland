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
