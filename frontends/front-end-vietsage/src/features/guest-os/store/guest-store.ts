import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { GuestCurrentSessionResult, GuestScanQrResult } from "@/features/guest-os/types/guest-os-contract";

type GuestHotelState = GuestScanQrResult["hotel"];
type GuestRoomState = GuestScanQrResult["room"];
type GuestProfileState = GuestScanQrResult["guest"];

type GuestStore = {
  sessionToken: string | null;
  expiresAt: string | null;
  hotel: GuestHotelState | null;
  room: GuestRoomState | null;
  guest: GuestProfileState | null;
  language: string | null;

  setGuestSession: (session: GuestScanQrResult) => void;
  importSessionToken: (sessionToken: string) => void;
  refreshSessionSnapshot: (session: GuestCurrentSessionResult) => void;
  setLanguage: (value: string) => void;
  clearSession: () => void;
};

const initialGuestState: Pick<GuestStore, "sessionToken" | "expiresAt" | "hotel" | "room" | "guest" | "language"> = {
  sessionToken: null,
  expiresAt: null,
  hotel: null,
  room: null,
  guest: null,
  language: null,
};

function sanitizeSession(session: GuestScanQrResult): Pick<GuestStore, "sessionToken" | "expiresAt" | "hotel" | "room" | "guest"> {
  return {
    sessionToken: session.sessionToken.trim() || null,
    expiresAt: session.expiresAt.trim() || null,
    hotel: {
      name: session.hotel.name,
      timezone: session.hotel.timezone,
      brandSettings: session.hotel.brandSettings,
    },
    room: {
      roomNumber: session.room.roomNumber,
      floor: session.room.floor,
      type: session.room.type,
    },
    guest: {
      displayName: session.guest.displayName,
      plannedCheckOutAt: session.guest.plannedCheckOutAt,
    },
  };
}

export const useGuestStore = create<GuestStore>()(
  persist(
    (set) => ({
      ...initialGuestState,
      setGuestSession: (session) => set(sanitizeSession(session)),
      importSessionToken: (sessionToken) => set({ sessionToken: sessionToken.trim() || null }),
      refreshSessionSnapshot: ({ session }) => set({
        expiresAt: session.expiresAt,
        hotel: { name: session.hotel.name, timezone: session.hotel.timezone, brandSettings: session.hotel.brandSettings as Record<string, unknown> | null },
        room: { roomNumber: session.room.roomNumber, floor: session.room.floor, type: session.room.type },
        guest: { displayName: session.stay.guestDisplayName, plannedCheckOutAt: session.stay.plannedCheckOutAt },
      }),
      setLanguage: (value) => set({ language: value.trim() || null }),
      clearSession: () =>
        set((state) => ({
          ...initialGuestState,
          language: state.language,
        })),
    }),
    {
      name: "vietsage.guest-os.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        expiresAt: state.expiresAt,
        hotel: state.hotel,
        room: state.room,
        guest: state.guest,
        language: state.language,
      }),
    },
  ),
);

const hydrationListeners = new Set<() => void>();

function emitHydrationChange() {
  hydrationListeners.forEach((listener) => listener());
}

function subscribeToHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  const unsubscribeHydrate = useGuestStore.persist.onHydrate(emitHydrationChange);
  const unsubscribeFinishHydration = useGuestStore.persist.onFinishHydration(emitHydrationChange);

  return () => {
    hydrationListeners.delete(listener);
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

export function useGuestStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => useGuestStore.persist.hasHydrated(),
    () => false,
  );
}

export type { GuestStore };
