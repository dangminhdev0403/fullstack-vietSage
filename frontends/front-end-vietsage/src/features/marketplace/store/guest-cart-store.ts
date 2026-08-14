import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MarketplaceServiceItem } from "../types/marketplace-contract";

export type GuestCartItem = {
  serviceId: string;
  name: string;
  unitPrice: number | string;
  currency: string;
  unit?: string | null;
  pricingUnit?: string | null;
  imageUrls: string[];
  mode: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
  providerName: string;
  providerAddress?: string | null;
  providerPhone?: string | null;
  quantity: number;
  maxCapacity?: number | null;
  waitingMinutes?: number;
  guestNote?: string;
};

export type GuestCartStore = {
  items: GuestCartItem[];
  addItem: (service: MarketplaceServiceItem, quantity?: number, note?: string) => void;
  updateQuantity: (serviceId: string, quantity: number) => void;
  removeItem: (serviceId: string) => void;
  updateItemNote: (serviceId: string, note: string) => void;
  clearCart: () => void;
  getItemCount: () => number;
};

export const useGuestCartStore = create<GuestCartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (service, quantity = 1, note) => {
        const qty = Math.max(1, Math.floor(quantity));
        const maxCap = service.capacityAvailable ?? undefined;
        const currentItems = get().items;
        const existingIndex = currentItems.findIndex((item) => item.serviceId === service.id);

        if (existingIndex >= 0) {
          const existing = currentItems[existingIndex];
          const newQty = maxCap !== undefined ? Math.min(maxCap, existing.quantity + qty) : existing.quantity + qty;
          const updated = [...currentItems];
          updated[existingIndex] = {
            ...existing,
            quantity: newQty,
            guestNote: note !== undefined ? note : existing.guestNote,
          };
          set({ items: updated });
        } else {
          const providerName = service.serviceTenant?.serviceProfile?.displayName || "Nhà cung cấp";
          const newItem: GuestCartItem = {
            serviceId: service.id,
            name: service.name,
            unitPrice: service.unitPrice,
            currency: service.currency || "VND",
            unit: service.unit,
            imageUrls: service.imageUrls || [],
            mode: service.mode,
            providerName,
            providerAddress: service.serviceTenant?.serviceProfile?.address,
            providerPhone: service.serviceTenant?.serviceProfile?.phone,
            quantity: maxCap !== undefined ? Math.min(maxCap, qty) : qty,
            maxCapacity: service.capacityAvailable,
            waitingMinutes: service.waitingMinutes,
            guestNote: note,
          };
          set({ items: [...currentItems, newItem] });
        }
      },

      updateQuantity: (serviceId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(serviceId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) => {
            if (item.serviceId !== serviceId) return item;
            const maxCap = item.maxCapacity ?? undefined;
            const targetQty = maxCap !== undefined ? Math.min(maxCap, quantity) : quantity;
            return { ...item, quantity: Math.max(1, targetQty) };
          }),
        }));
      },

      removeItem: (serviceId) => {
        set((state) => ({
          items: state.items.filter((item) => item.serviceId !== serviceId),
        }));
      },

      updateItemNote: (serviceId, note) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.serviceId === serviceId ? { ...item, guestNote: note } : item,
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      getItemCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: "vietsage.guest-marketplace-cart.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

const hydrationListeners = new Set<() => void>();

function emitHydrationChange() {
  hydrationListeners.forEach((listener) => listener());
}

function subscribeToHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  const unsubscribeHydrate = useGuestCartStore.persist.onHydrate(emitHydrationChange);
  const unsubscribeFinishHydration = useGuestCartStore.persist.onFinishHydration(emitHydrationChange);

  return () => {
    hydrationListeners.delete(listener);
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

export function useGuestCartStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => useGuestCartStore.persist.hasHydrated(),
    () => false,
  );
}
