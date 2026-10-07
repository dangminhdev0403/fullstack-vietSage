import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceUIState = {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
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

export const useWorkspaceUIStore = create<WorkspaceUIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSidebarCollapsed: (isSidebarCollapsed: boolean) =>
        set({ isSidebarCollapsed }),
    }),
    {
      name: "vietsage_workspace_ui",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Backward-compatibility: migrate legacy localStorage key if present
        if (typeof window !== "undefined") {
          try {
            const legacyVal = window.localStorage.getItem("vietsage_sidebar_collapsed");
            if (legacyVal === "true" && !state.isSidebarCollapsed) {
              state.setSidebarCollapsed(true);
            }
          } catch {
            // Ignore storage errors in restricted contexts
          }
        }
      },
    },
  ),
);

const hydrationListeners = new Set<() => void>();

function emitHydrationChange() {
  hydrationListeners.forEach((listener) => listener());
}

function subscribeToHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  const unsubscribeHydrate = useWorkspaceUIStore.persist.onHydrate(emitHydrationChange);
  const unsubscribeFinishHydration = useWorkspaceUIStore.persist.onFinishHydration(emitHydrationChange);

  return () => {
    hydrationListeners.delete(listener);
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

export function useWorkspaceUIStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => useWorkspaceUIStore.persist.hasHydrated(),
    () => false,
  );
}
