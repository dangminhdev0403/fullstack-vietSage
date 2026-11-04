"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";
import { safeRandomUuid } from "../utils/safe-uuid";

const STORAGE_KEY = "vietsage:cccd-mobile-desk-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MobileDeskState {
  deskId: string;
  initialize: () => void;
}

// Per-tab identity survives route changes/reloads; sessionStorage is isolated between tabs.
export const useMobileDesk = create<MobileDeskState>()(
  persist(
    (set, get) => ({
      deskId: "",
      initialize: () => {
        const current = get().deskId;
        if (current && UUID.test(current)) return;
        set({ deskId: safeRandomUuid() });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage("sessionStorage")),
      partialize: (state) => ({ deskId: state.deskId }),
    },
  ),
);
