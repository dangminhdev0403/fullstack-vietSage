import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type MarketplaceAdminImportState = {
  categorySheetUrl: string;
  partnerSheetUrls: Record<string, string>;
  setCategorySheetUrl: (url: string) => void;
  setPartnerSheetUrl: (tenantKey: string, url: string) => void;
  getPartnerSheetUrl: (tenantId?: string | null, tenantCode?: string | null) => string;
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

export const useMarketplaceAdminImportStore = create<MarketplaceAdminImportState>()(
  persist(
    (set, get) => ({
      categorySheetUrl: "",
      partnerSheetUrls: {},

      setCategorySheetUrl: (url: string) =>
        set({ categorySheetUrl: url }),

      setPartnerSheetUrl: (tenantKey: string, url: string) => {
        if (!tenantKey) return;
        set((state) => ({
          partnerSheetUrls: {
            ...state.partnerSheetUrls,
            [tenantKey]: url,
          },
        }));
      },

      getPartnerSheetUrl: (tenantId?: string | null, tenantCode?: string | null) => {
        const state = get();
        if (tenantId && state.partnerSheetUrls[tenantId]) {
          return state.partnerSheetUrls[tenantId];
        }
        if (tenantCode && state.partnerSheetUrls[tenantCode]) {
          return state.partnerSheetUrls[tenantCode];
        }
        // Fallback to legacy localStorage keys if not yet persisted in store
        if (typeof window !== "undefined") {
          try {
            if (tenantId) {
              const legacyId = window.localStorage.getItem(`vietsage_partner_${tenantId}_sheet_url`);
              if (legacyId) return legacyId;
            }
            if (tenantCode) {
              const legacyCode = window.localStorage.getItem(`vietsage_partner_${tenantCode}_sheet_url`);
              if (legacyCode) return legacyCode;
            }
            const generic1 = window.localStorage.getItem("vietsage_partner_service_items_sheet_url");
            if (generic1) return generic1;
            const generic2 = window.localStorage.getItem("vietsage_marketplace_partner_sheet_url");
            if (generic2) return generic2;
          } catch {
            // Ignore storage errors
          }
        }
        return "";
      },
    }),
    {
      name: "vietsage_marketplace_admin_import",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        categorySheetUrl: state.categorySheetUrl,
        partnerSheetUrls: state.partnerSheetUrls,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Migrate legacy categorySheetUrl if store is empty
        if (typeof window !== "undefined") {
          try {
            if (!state.categorySheetUrl) {
              const legacyCat = window.localStorage.getItem("vietsage_marketplace_category_sheet_url");
              if (legacyCat) {
                state.setCategorySheetUrl(legacyCat);
              }
            }
          } catch {
            // Ignore storage errors
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
  const unsubscribeHydrate = useMarketplaceAdminImportStore.persist.onHydrate(emitHydrationChange);
  const unsubscribeFinishHydration = useMarketplaceAdminImportStore.persist.onFinishHydration(emitHydrationChange);

  return () => {
    hydrationListeners.delete(listener);
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

export function useMarketplaceAdminImportStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => useMarketplaceAdminImportStore.persist.hasHydrated(),
    () => false,
  );
}
