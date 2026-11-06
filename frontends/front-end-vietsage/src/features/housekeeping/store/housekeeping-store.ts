"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ClaimedRoomInfo,
  HousekeepingFilterState,
  HousekeepingRoomStatus,
  HousekeepingViewMode,
} from "../types/housekeeping-contract";

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

const DEFAULT_FILTER: HousekeepingFilterState = {
  status: "processing",
  floor: "all",
  search: "",
};

function normalizeFilterStatus(status: HousekeepingRoomStatus): HousekeepingRoomStatus {
  if (status === "all" || status === "processing") return status;
  if (status === "blocked" || status === "maintenance" || status === "occupied") return "all";
  return "processing";
}

function normalizeFilter(filter: HousekeepingFilterState): HousekeepingFilterState {
  const status = normalizeFilterStatus(filter.status);
  return status === filter.status ? filter : { ...filter, status };
}

interface HousekeepingState {
  viewModeMap: Record<string, HousekeepingViewMode>;
  filterMap: Record<string, HousekeepingFilterState>;
  claimedRoomsMap: Record<string, Record<string, ClaimedRoomInfo>>;

  getViewMode: (hotelId: string) => HousekeepingViewMode;
  setViewMode: (hotelId: string, mode: HousekeepingViewMode) => void;

  getFilter: (hotelId: string) => HousekeepingFilterState;
  setFilter: (hotelId: string, patch: Partial<HousekeepingFilterState>) => void;
  resetFilter: (hotelId: string) => void;

  isRoomClaimed: (hotelId: string, roomId: string) => boolean;
  getClaimedInfo: (hotelId: string, roomId: string) => ClaimedRoomInfo | undefined;
  claimRoom: (
    hotelId: string,
    roomId: string,
    staff: { staffId: string; staffName: string },
  ) => void;
  unclaimRoom: (hotelId: string, roomId: string) => void;
  clearClaimedRooms: (hotelId: string) => void;
}

export const useHousekeepingStore = create<HousekeepingState>()(
  persist(
    (set, get) => ({
      viewModeMap: {},
      filterMap: {},
      claimedRoomsMap: {},

      getViewMode: (hotelId) => {
        return get().viewModeMap[hotelId] ?? "tasklist";
      },

      setViewMode: (hotelId, mode) => {
        set((state) => ({
          viewModeMap: {
            ...state.viewModeMap,
            [hotelId]: mode,
          },
        }));
      },

      getFilter: (hotelId) => {
        return get().filterMap[hotelId] ?? DEFAULT_FILTER;
      },

      setFilter: (hotelId, patch) => {
        set((state) => {
          const current = state.filterMap[hotelId] ?? DEFAULT_FILTER;
          return {
            filterMap: {
              ...state.filterMap,
              [hotelId]: normalizeFilter({
                ...current,
                ...patch,
              }),
            },
          };
        });
      },

      resetFilter: (hotelId) => {
        set((state) => ({
          filterMap: {
            ...state.filterMap,
            [hotelId]: DEFAULT_FILTER,
          },
        }));
      },

      isRoomClaimed: (hotelId, roomId) => {
        return Boolean(get().claimedRoomsMap[hotelId]?.[roomId]);
      },

      getClaimedInfo: (hotelId, roomId) => {
        return get().claimedRoomsMap[hotelId]?.[roomId];
      },

      claimRoom: (hotelId, roomId, staff) => {
        set((state) => {
          const currentHotelMap = state.claimedRoomsMap[hotelId] ?? {};
          return {
            claimedRoomsMap: {
              ...state.claimedRoomsMap,
              [hotelId]: {
                ...currentHotelMap,
                [roomId]: {
                  staffId: staff.staffId,
                  staffName: staff.staffName,
                  claimedAt: new Date().toISOString(),
                },
              },
            },
          };
        });
      },

      unclaimRoom: (hotelId, roomId) => {
        set((state) => {
          const currentHotelMap = { ...(state.claimedRoomsMap[hotelId] ?? {}) };
          delete currentHotelMap[roomId];
          return {
            claimedRoomsMap: {
              ...state.claimedRoomsMap,
              [hotelId]: currentHotelMap,
            },
          };
        });
      },

      clearClaimedRooms: (hotelId) => {
        set((state) => {
          const next = { ...state.claimedRoomsMap };
          delete next[hotelId];
          return { claimedRoomsMap: next };
        });
      },
    }),
    {
      name: "vietsage-housekeeping-store",
      storage: createJSONStorage(() => safeStorage),
      // Keep the first client render identical to the server render. The
      // persisted filter is restored by HousekeepingWorkspace after mount.
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<HousekeepingState> | undefined;
        return {
          ...currentState,
          ...persisted,
          filterMap: Object.fromEntries(
            Object.entries(persisted?.filterMap ?? currentState.filterMap).map(
              ([hotelId, filter]) => [hotelId, normalizeFilter(filter)],
            ),
          ),
        };
      },
    },
  ),
);
