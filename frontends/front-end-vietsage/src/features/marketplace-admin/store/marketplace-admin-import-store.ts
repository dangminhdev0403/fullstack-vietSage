import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

export type MarketplaceAdminImportState = {
  categorySheetUrl: string;
  partnerSheetUrls: Record<string, string>;
  setCategorySheetUrl: (url: string) => void;
  setPartnerSheetUrl: (tenantKey: string, url: string) => void;
  getPartnerSheetUrl: (tenantId?: string | null, tenantCode?: string | null) => string;
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
        if (tenantId) {
          const legacyId = safeStorage.getItem(`vietsage_partner_${tenantId}_sheet_url`);
          if (legacyId) return legacyId;
        }
        if (tenantCode) {
          const legacyCode = safeStorage.getItem(`vietsage_partner_${tenantCode}_sheet_url`);
          if (legacyCode) return legacyCode;
        }
        const generic1 = safeStorage.getItem("vietsage_partner_service_items_sheet_url");
        if (generic1) return generic1;
        const generic2 = safeStorage.getItem("vietsage_marketplace_partner_sheet_url");
        if (generic2) return generic2;
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
        if (!state.categorySheetUrl) {
          const legacyCat = safeStorage.getItem("vietsage_marketplace_category_sheet_url");
          if (legacyCat) {
            state.setCategorySheetUrl(legacyCat);
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
