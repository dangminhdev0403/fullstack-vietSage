import type { Hotel } from "@/features/admin/types/admin-contract";
import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";

export type ServiceTenant = {
  id: string;
  code: string;
  name: string;
  serviceProfile: { displayName: string; status: string } | null;
};
export type HotelLink = {
  id: string;
  hotelId: string;
  serviceTenantId: string;
  status: "ACTIVE" | "DISABLED";
  sortOrder: number;
  serviceTenant: ServiceTenant;
};
export type MarketplaceAdminData = {
  categories: MarketplaceCategory[];
  tenants: ServiceTenant[];
  hotels: Hotel[];
  links: HotelLink[];
};
export type MarketplaceAdminAction =
  | { action: "category"; input: { code: string; nameVi: string; nameEn: string; sortOrder: number; isActive: boolean } }
  | { action: "tenant"; input: { code: string; name: string; displayName: string; owner: { email: string; fullName: string; password: string } } }
  | { action: "link"; hotelId: string; serviceTenantId: string };
