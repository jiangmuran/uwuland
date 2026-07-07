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
