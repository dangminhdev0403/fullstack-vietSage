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
