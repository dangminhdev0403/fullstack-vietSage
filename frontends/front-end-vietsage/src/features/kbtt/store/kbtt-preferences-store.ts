import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

export type KbttPreferencesState = {
  pageSize: number;
  setPageSize: (pageSize: number) => void;
};

const LEGACY_STORAGE_KEY = "vietsage_kbtt_page_size";
const VALID_PAGE_SIZES = [10, 20, 50, 100];

function resolveInitialPageSize(): number {
  const legacy = Number(safeStorage.getItem(LEGACY_STORAGE_KEY));
  if (VALID_PAGE_SIZES.includes(legacy)) return legacy;
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
