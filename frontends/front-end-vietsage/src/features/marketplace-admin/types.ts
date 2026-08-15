import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";

export type ServiceTenant = {
  id: string;
  code: string;
  name: string;
  ownerEmail?: string | null;
  ownerFullName?: string | null;
  serviceProfile: { displayName: string; status: string; categoryId?: string | null; googleSheetsUrl?: string | null; category?: MarketplaceCategory | null } | null;
};
export type MarketplaceCategorySheetPreview = {
  workbookHash: string;
  summary: { creates?: number; create?: number; updates?: number; update?: number; disables?: number; disable?: number; unchanged: number; errors: number };
  validation: Array<{
    sheet: string;
    row: number;
    col: string;
    value: string;
    message: string;
    severity: "error" | "warning";
  }>;
  diff: Array<{
    key: string;
    action: "create" | "update" | "disable" | "unchanged";
    changes?: Array<{ field: string; from?: unknown; to?: unknown }> | Record<string, { from: string; to: string }>;
    payload?: Record<string, unknown>;
    label?: string;
  }>;
};

export type MarketplacePricingConfig = {
  deliveryServiceFeeRate: string | number;
};

export type MarketplaceAdminData = {
  categories: MarketplaceCategory[];
  tenants: ServiceTenant[];
  pricingConfig: MarketplacePricingConfig;
};

export type MarketplaceAdminAction =
  | { action: "category"; input: { nameVi: string; sortOrder: number; isActive: boolean; translations?: Record<string, string> } }
  | { action: "tenant"; input: { displayName: string; categoryId: string; googleSheetsUrl?: string | null; owner: { email: string; fullName: string; password: string } } }
  | { action: "updateCategory"; id: string; input: { nameVi?: string; isActive?: boolean; translations?: Record<string, string> } }
  | { action: "deleteCategory"; id: string }
  | { action: "updateTenant"; id: string; input: { displayName?: string; categoryId?: string; status?: string; googleSheetsUrl?: string | null; owner?: { email?: string; fullName?: string; password?: string } } }
  | { action: "updatePricingConfig"; input: { deliveryServiceFeeRate: number } }
  | { action: "previewImport"; spreadsheetUrl: string }
  | { action: "commitImport"; spreadsheetUrl: string; expectedHash: string };
