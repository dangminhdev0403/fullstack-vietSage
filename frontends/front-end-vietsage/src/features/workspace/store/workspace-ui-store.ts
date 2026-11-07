import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

export type WorkspaceUIState = {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
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
        const legacyVal = safeStorage.getItem("vietsage_sidebar_collapsed");
        if (legacyVal === "true" && !state.isSidebarCollapsed) {
          state.setSidebarCollapsed(true);
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
