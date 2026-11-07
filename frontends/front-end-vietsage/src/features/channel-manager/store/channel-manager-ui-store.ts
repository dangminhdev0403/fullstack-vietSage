import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";
import type { ChannelManagerTabId } from "../utils/channel-manager-access";

export type ChannelManagerUIState = {
  activeTabsByHotel: Record<string, ChannelManagerTabId>;
  setActiveTab: (hotelId: string, tab: ChannelManagerTabId) => void;
  getActiveTab: (hotelId: string) => ChannelManagerTabId | undefined;
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
        const legacy = safeStorage.getItem(`vietsage_cm_tab_${hotelId}`) as ChannelManagerTabId | null;
        if (legacy) return legacy;
        return undefined;
      },
    }),
    {
      name: "vietsage_channel_manager_ui",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
