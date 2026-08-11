import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";

export type ServiceTenant = {
  id: string;
  code: string;
  name: string;
  ownerEmail?: string | null;
  ownerFullName?: string | null;
  serviceProfile: { displayName: string; status: string } | null;
};
export type MarketplaceAdminData = {
  categories: MarketplaceCategory[];
  tenants: ServiceTenant[];
};
export type MarketplaceAdminAction =
  | { action: "category"; input: { nameVi: string; nameEn: string; sortOrder: number; isActive: boolean } }
  | { action: "tenant"; input: { displayName: string; owner: { email: string; fullName: string; password: string } } }
  | { action: "updateCategory"; id: string; input: { nameVi?: string; nameEn?: string; isActive?: boolean } }
  | { action: "updateTenant"; id: string; input: { displayName?: string; status?: string; owner?: { email?: string; fullName?: string; password?: string } } };
