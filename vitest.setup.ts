// Vitest test-environment shim.
//
// Node 25 exposes a native Web Storage `localStorage` global, but unless the
// process is started with a valid `--localstorage-file` it is a non-functional
// stub whose methods are `undefined`, and happy-dom (v20) defers to that native
// global instead of installing its own. Tests that touch `localStorage` would
// otherwise throw `localStorage.clear is not a function`. Install a small,
// spec-compliant in-memory Storage so `localStorage` behaves correctly in tests
// regardless of Node version or Vitest pool.

class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    const value = this.store.get(key);
    return value === undefined ? null : value;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

export {};
