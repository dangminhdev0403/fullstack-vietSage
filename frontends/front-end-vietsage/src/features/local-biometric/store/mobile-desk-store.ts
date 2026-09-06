"use client";

import { create } from "zustand";
import { safeRandomUuid } from "../utils/safe-uuid";

const STORAGE_KEY = "vietsage:cccd-mobile-desk-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Per-tab identity survives route changes/reloads; sessionStorage is isolated between tabs.
export const useMobileDesk = create<{ deskId: string; initialize: () => void }>((set, get) => ({
  deskId: "",
  initialize: () => {
    if (get().deskId) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const deskId = stored && UUID.test(stored) ? stored : safeRandomUuid();
    sessionStorage.setItem(STORAGE_KEY, deskId);
    set({ deskId });
  },
}));
