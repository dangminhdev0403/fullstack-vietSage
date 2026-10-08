import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LocalMateViewMode, PublicLocalMateStage } from "../types";

export type LocalMateSessionState = {
  isOpen: boolean;
  viewMode: LocalMateViewMode;
  stage: PublicLocalMateStage;
  activeOrderId: string | null;
  activeProposalKey: string | null;
  activeCandidateKey: string | null;
  lastChatUrl: string | null;
  paymentExpiresAt: number | null;

  // Primitive mutations
  setIsOpen: (isOpen: boolean) => void;
  setViewMode: (viewMode: LocalMateViewMode) => void;
  setStage: (stage: PublicLocalMateStage) => void;
  setActiveOrderId: (orderId: string | null) => void;
  setActiveProposalKey: (key: string | null) => void;
  setActiveCandidateKey: (key: string | null) => void;
  setLastChatUrl: (url: string | null) => void;
  setPaymentExpiresAt: (expiresAt: number | null) => void;

  // Semantic domain actions
  openGuideChat: (orderId: string) => void;
  openPayment: (orderId: string, expiresAt?: number | null) => void;
  resetSession: () => void;
};

const memoryStorage = new Map<string, string>();
const safeStorage = {
  getItem: (name: string) => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(name);
    }
    return memoryStorage.get(name) ?? null;
  },
  setItem: (name: string, value: string) => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(name, value);
      return;
    }
    memoryStorage.set(name, value);
  },
  removeItem: (name: string) => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(name);
      return;
    }
    memoryStorage.delete(name);
  },
};

export const useLocalMateSessionStore = create<LocalMateSessionState>()(
  persist(
    (set) => ({
      isOpen: false,
      viewMode: "discovery",
      stage: "DISCOVERY",
      activeOrderId: null,
      activeProposalKey: null,
      activeCandidateKey: null,
      lastChatUrl: null,
      paymentExpiresAt: null,

      setIsOpen: (isOpen) => set({ isOpen }),
      setViewMode: (viewMode) => set({ viewMode }),
      setStage: (stage) => set({ stage }),
      setActiveOrderId: (activeOrderId) => set({ activeOrderId }),
      setActiveProposalKey: (activeProposalKey) => set({ activeProposalKey }),
      setActiveCandidateKey: (activeCandidateKey) => set({ activeCandidateKey }),
      setLastChatUrl: (lastChatUrl) => set({ lastChatUrl }),
      setPaymentExpiresAt: (paymentExpiresAt) => set({ paymentExpiresAt }),

      openGuideChat: (orderId) =>
        set({
          isOpen: true,
          viewMode: "guide-chat",
          activeOrderId: orderId,
        }),

      openPayment: (orderId, expiresAt) =>
        set({
          isOpen: true,
          viewMode: "payment",
          activeOrderId: orderId,
          paymentExpiresAt: expiresAt ?? Date.now() + 5 * 60 * 1000,
        }),

      resetSession: () =>
        set({
          activeOrderId: null,
          activeProposalKey: null,
          activeCandidateKey: null,
          viewMode: "discovery",
          stage: "DISCOVERY",
          paymentExpiresAt: null,
        }),
    }),
    {
      name: "vietsage.localmate-session.v1",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        isOpen: state.isOpen,
        viewMode: state.viewMode,
        stage: state.stage,
        activeOrderId: state.activeOrderId,
        activeProposalKey: state.activeProposalKey,
        activeCandidateKey: state.activeCandidateKey,
        lastChatUrl: state.lastChatUrl,
        paymentExpiresAt: state.paymentExpiresAt,
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
  const unsubscribeHydrate = useLocalMateSessionStore.persist.onHydrate(emitHydrationChange);
  const unsubscribeFinishHydration = useLocalMateSessionStore.persist.onFinishHydration(emitHydrationChange);

  return () => {
    hydrationListeners.delete(listener);
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

export function useLocalMateSessionStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => useLocalMateSessionStore.persist.hasHydrated(),
    () => false,
  );
}
