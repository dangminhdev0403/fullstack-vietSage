import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarState = { isCollapsed: boolean; toggle: () => void };

export const useWorkspaceSidebar = create<SidebarState>()(persist(
  (set) => ({ isCollapsed: false, toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })) }),
  {
    name: "vietsage_sidebar_collapsed",
    skipHydration: true,
    // ponytail: retain the existing boolean storage format; version only if preferences expand.
    storage: {
      getItem: (name) => {
        try {
          const value = localStorage.getItem(name);
          return value === null ? null : { state: { isCollapsed: value === "true" } };
        } catch { return null; }
      },
      setItem: (name, value) => {
        try { localStorage.setItem(name, String(value.state.isCollapsed)); } catch { return; }
      },
      removeItem: (name) => {
        try { localStorage.removeItem(name); } catch { return; }
      },
    },
    partialize: (state) => ({ isCollapsed: state.isCollapsed }),
  },
));

