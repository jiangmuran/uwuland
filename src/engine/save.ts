import type { SaveData } from './state';

export type SaveSlot = 'auto' | 'manual';

function storageKey(slot: SaveSlot): string {
  return `uwuland-save-${slot}`;
}

export function saveGame(slot: SaveSlot, data: SaveData): void {
  localStorage.setItem(storageKey(slot), JSON.stringify(data));
}

export function loadGame(slot: SaveSlot): SaveData | null {
  const raw = localStorage.getItem(storageKey(slot));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidSaveData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValidSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.chapter === 'string' &&
    typeof v.pauseIndex === 'number' &&
    typeof v.entryVars === 'object' && v.entryVars !== null &&
    Array.isArray(v.entryInventory) &&
    typeof v.time === 'string'
  );
}
