import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChannelManagerTabId } from "../utils/channel-manager-access";

export type ChannelManagerUIState = {
  activeTabsByHotel: Record<string, ChannelManagerTabId>;
  setActiveTab: (hotelId: string, tab: ChannelManagerTabId) => void;
  getActiveTab: (hotelId: string) => ChannelManagerTabId | undefined;
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

export const useChannelManagerUIStore = create<ChannelManagerUIState>()(
  persist(
    (set, get) => ({
      activeTabsByHotel: {},
      setActiveTab: (hotelId, tab) => {
        set((state) => ({
          activeTabsByHotel: {
            ...state.activeTabsByHotel,
            [hotelId]: tab,
          },
        }));
      },
      getActiveTab: (hotelId) => {
        const stored = get().activeTabsByHotel[hotelId];
        if (stored) return stored;
        // Legacy fallback
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            const legacy = window.localStorage.getItem(`vietsage_cm_tab_${hotelId}`) as ChannelManagerTabId;
            if (legacy) return legacy;
          } catch {}
        }
        return undefined;
      },
    }),
    {
      name: "vietsage_channel_manager_ui",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
