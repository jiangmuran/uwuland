export type PuzzleResult = Record<string, number | boolean>;

export interface PuzzleContext {
  container: HTMLElement;
  param: string;
  resolve: (result: PuzzleResult) => void;
}

export type PuzzleMounter = (ctx: PuzzleContext) => void;
