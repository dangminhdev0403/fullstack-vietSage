import type { StateStorage } from "zustand/middleware";

export type StorageTarget = Storage | "localStorage" | "sessionStorage";

class MemoryStorage implements StateStorage {
  private store = new Map<string, string>();

  getItem(name: string): string | null {
    return this.store.get(name) ?? null;
  }

  setItem(name: string, value: string): void {
    this.store.set(name, value);
  }

  removeItem(name: string): void {
    this.store.delete(name);
  }

  clear(): void {
    this.store.clear();
  }
}

export interface SafeStorageAdapter extends StateStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

const memoryFallback = new MemoryStorage();

export function createSafeStorage(target: StorageTarget = "localStorage"): SafeStorageAdapter {
  return {
    getItem(name: string): string | null {
      if (typeof window === "undefined") {
        return memoryFallback.getItem(name);
      }
      try {
        const storage = typeof target === "string" ? window[target] : target;
        if (!storage) return memoryFallback.getItem(name);
        return storage.getItem(name);
      } catch {
        return memoryFallback.getItem(name);
      }
    },
    setItem(name: string, value: string): void {
      if (typeof window === "undefined") {
        memoryFallback.setItem(name, value);
        return;
      }
      try {
        const storage = typeof target === "string" ? window[target] : target;
        if (!storage) {
          memoryFallback.setItem(name, value);
          return;
        }
        storage.setItem(name, value);
      } catch {
        memoryFallback.setItem(name, value);
      }
    },
    removeItem(name: string): void {
      if (typeof window === "undefined") {
        memoryFallback.removeItem(name);
        return;
      }
      try {
        const storage = typeof target === "string" ? window[target] : target;
        if (!storage) {
          memoryFallback.removeItem(name);
          return;
        }
        storage.removeItem(name);
      } catch {
        memoryFallback.removeItem(name);
      }
    },
  };
}

export const safeLocalStorage = createSafeStorage("localStorage");
export const safeSessionStorage = createSafeStorage("sessionStorage");

export function safeStorage(target?: StorageTarget): SafeStorageAdapter {
  if (!target || target === "localStorage") {
    return safeLocalStorage;
  }
  if (target === "sessionStorage") {
    return safeSessionStorage;
  }
  return createSafeStorage(target);
}

safeStorage.getItem = safeLocalStorage.getItem;
safeStorage.setItem = safeLocalStorage.setItem;
safeStorage.removeItem = safeLocalStorage.removeItem;
