"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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

export type OperationalViewMode = "grid" | "tape-chart";

interface RoomViewState {
  // Map of hotelId -> view mode ("grid" vs "tape-chart")
  viewModeMap: Record<string, OperationalViewMode>;
  setViewMode: (hotelId: string, mode: OperationalViewMode) => void;
}

export const useRoomViewStore = create<RoomViewState>()(
  persist(
    (set) => ({
      viewModeMap: {},
      setViewMode: (hotelId, mode) =>
        set((state) => ({
          viewModeMap: {
            ...state.viewModeMap,
            [hotelId]: mode,
          },
        })),
    }),
    {
      name: "vietsage-hotel-rooms-view-mode",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
