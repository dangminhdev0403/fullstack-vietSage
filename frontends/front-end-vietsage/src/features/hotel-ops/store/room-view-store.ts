"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

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
