export type TextStyle = 'normal' | 'small' | 'big' | 'italic';

export interface UIPort {
  showText(text: string, style: TextStyle): Promise<void>;
  showChoices(options: string[]): Promise<number>;
  setHead(value: string): void;
  clearText(): void;
  wait(ms: number): Promise<void>;
  pause(): Promise<void>;
  runPuzzle(name: string): Promise<Record<string, number | boolean>>;
  // 可选:在章节开始时播放章节标题闪屏。设为可选,现有测试替身无需实现即可通过类型检查。
  announceChapter?(name: string): void;
}
