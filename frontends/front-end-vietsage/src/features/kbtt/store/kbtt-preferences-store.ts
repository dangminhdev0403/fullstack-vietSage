import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type KbttPreferencesState = {
  pageSize: number;
  setPageSize: (pageSize: number) => void;
};

const memoryStorage = new Map<string, string>();

const safeStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(name);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    return memoryStorage.get(name) ?? null;
  },
  setItem: (name: string, value: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(name, value);
        return;
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    memoryStorage.set(name, value);
  },
  removeItem: (name: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(name);
        return;
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    memoryStorage.delete(name);
  },
};

const LEGACY_STORAGE_KEY = "vietsage_kbtt_page_size";
const VALID_PAGE_SIZES = [10, 20, 50, 100];

function resolveInitialPageSize(): number {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const legacy = Number(window.localStorage.getItem(LEGACY_STORAGE_KEY));
      if (VALID_PAGE_SIZES.includes(legacy)) return legacy;
    }
  } catch {}
  return 20;
}

export const useKbttPreferencesStore = create<KbttPreferencesState>()(
  persist(
    (set) => ({
      pageSize: resolveInitialPageSize(),
      setPageSize: (size) => {
        const valid = VALID_PAGE_SIZES.includes(size) ? size : 20;
        set({ pageSize: valid });
      },
    }),
    {
      name: "vietsage_kbtt_preferences",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
