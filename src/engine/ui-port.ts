export type TextStyle = 'normal' | 'small' | 'big' | 'italic';

export interface UIPort {
  showText(text: string, style: TextStyle): Promise<void>;
  showChoices(options: string[]): Promise<number>;
  setHead(value: string): void;
  clearText(): void;
  wait(ms: number): Promise<void>;
  pause(): Promise<void>;
  runPuzzle(name: string): Promise<Record<string, number | boolean>>;
}
