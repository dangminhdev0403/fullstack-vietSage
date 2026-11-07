"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

interface RoomOrderState {
  // Map of hotelId -> array of room IDs representing custom display order
  roomOrderMap: Record<string, string[]>;
  setRoomOrder: (hotelId: string, roomIds: string[]) => void;
  reorderRooms: (hotelId: string, activeId: string, overId: string) => void;
  resetRoomOrder: (hotelId: string) => void;
}

export const useRoomOrderStore = create<RoomOrderState>()(
  persist(
    (set, get) => ({
      roomOrderMap: {},

      setRoomOrder: (hotelId, roomIds) =>
        set((state) => ({
          roomOrderMap: {
            ...state.roomOrderMap,
            [hotelId]: roomIds,
          },
        })),

      reorderRooms: (hotelId, activeId, overId) => {
        if (activeId === overId) return;
        const currentList = get().roomOrderMap[hotelId] || [];
        const oldIndex = currentList.indexOf(activeId);
        const newIndex = currentList.indexOf(overId);

        if (oldIndex === -1 || newIndex === -1) return;

        const updated = [...currentList];
        const [moved] = updated.splice(oldIndex, 1);
        updated.splice(newIndex, 0, moved);

        set((state) => ({
          roomOrderMap: {
            ...state.roomOrderMap,
            [hotelId]: updated,
          },
        }));
      },

      resetRoomOrder: (hotelId) =>
        set((state) => {
          const nextMap = { ...state.roomOrderMap };
          delete nextMap[hotelId];
          return { roomOrderMap: nextMap };
        }),
    }),
    {
      name: "vietsage-tape-chart-room-order",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
