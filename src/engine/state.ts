import type { ExprContext } from './expressions';

export interface SaveData {
  chapter: string;
  pauseIndex: number;
  entryVars: Record<string, number>;
  entryInventory: string[];
  time: string;
}

export class GameState implements ExprContext {
  chapter = '';
  pauseIndex = 0;
  head = '#eee';
  private vars: Map<string, number>;
  private inventory: Set<string>;
  private entryVars: Map<string, number>;
  private entryInventory: Set<string>;

  constructor(init?: { vars?: Record<string, number>; inventory?: string[] }) {
    this.vars = new Map(Object.entries(init?.vars ?? {}));
    this.inventory = new Set(init?.inventory ?? []);
    this.entryVars = new Map(this.vars);
    this.entryInventory = new Set(this.inventory);
  }

  getVar(name: string): number {
    return this.vars.get(name) ?? 0;
  }

  setVar(name: string, value: number): void {
    this.vars.set(name, value);
  }

  hasItem(name: string): boolean {
    return this.inventory.has(name);
  }

  addItem(name: string): void {
    this.inventory.add(name);
  }

  removeItem(name: string): void {
    this.inventory.delete(name);
  }

  enterChapter(chapter: string): void {
    this.chapter = chapter;
    this.pauseIndex = 0;
    this.entryVars = new Map(this.vars);
    this.entryInventory = new Set(this.inventory);
  }

  toSaveData(time: string): SaveData {
    return {
      chapter: this.chapter,
      pauseIndex: this.pauseIndex,
      entryVars: Object.fromEntries(this.entryVars),
      entryInventory: [...this.entryInventory],
      time,
    };
  }

  static fromSaveData(data: SaveData): GameState {
    const state = new GameState({ vars: data.entryVars, inventory: data.entryInventory });
    state.chapter = data.chapter;
    return state;
  }
}
