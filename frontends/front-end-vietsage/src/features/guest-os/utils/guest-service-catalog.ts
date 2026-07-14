import type { GuestServiceCategory, GuestServicesResult } from "../types/guest-os-contract.ts";

export type GuestServiceCatalogView = {
  hotelId: string;
  categories: GuestServiceCategory[];
};

export function adaptGuestServiceCatalog(catalog: GuestServicesResult): GuestServiceCatalogView {
  return {
    hotelId: catalog.hotelId,
    categories: catalog.categories
      .filter((category) => category.items.length > 0)
      .map((category) => ({
        ...category,
        items: category.items.map(({ effectivePrice, effectiveCurrency, ...item }) => ({
          ...item,
          price: effectivePrice,
          currency: effectiveCurrency,
        })),
      })),
  };
}
