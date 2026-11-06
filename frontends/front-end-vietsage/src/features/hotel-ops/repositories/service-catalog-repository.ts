import { requestInternalApi } from "@/core/http/internal-api-client";
import type {
  CreateServiceCategoryInput, UpdateServiceCategoryInput,
  CreateServiceItemInput, UpdateServiceItemInput,
  HotelServiceCategory, HotelServiceItem,
} from "../types/hotel-ops-contract";

export type ServiceCatalogScope = { hotelId: string; surface: "owner" | "hotel-ops" };
export type SaveServiceCategoryInput = { id?: string; input: CreateServiceCategoryInput | UpdateServiceCategoryInput };
export type SaveServiceItemInput = { id?: string; input: CreateServiceItemInput | UpdateServiceItemInput };
function catalogPath(scope: ServiceCatalogScope, kind: "service-categories" | "service-items", id?: string) {
  return `/api/${scope.surface}/hotels/${encodeURIComponent(scope.hotelId)}/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`;
}
export const serviceCatalogRepository = {
  async categories(scope: ServiceCatalogScope, signal?: AbortSignal) {
    return (await requestInternalApi<{ items: HotelServiceCategory[] }>(catalogPath(scope, "service-categories"), { method: "GET", signal })).items;
  },
  async items(scope: ServiceCatalogScope, signal?: AbortSignal) {
    return (await requestInternalApi<{ items: HotelServiceItem[] }>(catalogPath(scope, "service-items"), { method: "GET", signal })).items;
  },
  saveCategory(scope: ServiceCatalogScope, { id, input }: SaveServiceCategoryInput) {
    return requestInternalApi<HotelServiceCategory>(catalogPath(scope, "service-categories", id), { method: id ? "PATCH" : "POST", body: input });
  },
  saveItem(scope: ServiceCatalogScope, { id, input }: SaveServiceItemInput) {
    return requestInternalApi<HotelServiceItem>(catalogPath(scope, "service-items", id), { method: id ? "PATCH" : "POST", body: input });
  },
};
