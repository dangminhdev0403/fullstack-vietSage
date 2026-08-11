import { MarketplaceAdminClient } from "@/features/marketplace-admin/marketplace-admin-client";

export const dynamic = "force-dynamic";
export default function MarketplaceAdminPage() {
  return <div className="mx-auto max-w-[1500px] space-y-7"><header><p className="font-semibold text-emerald-700">SUPER_ADMIN</p><h1 className="mt-2 text-4xl font-bold">Marketplace - Đối Tác Dịch Vụ</h1><p className="mt-2 text-slate-600">Quản lý taxonomy, tài khoản đối tác dịch vụ bên ngoài và liên kết khách sạn.</p></header><MarketplaceAdminClient /></div>;
}
