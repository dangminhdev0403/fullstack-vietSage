"use client";

import { MarketplaceAdminClient } from "@/features/marketplace-admin/marketplace-admin-client";

export default function MarketplaceAdminPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Quản trị nền tảng</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Đối tác dịch vụ bên ngoài</h1>
      </header>
      <MarketplaceAdminClient />
    </div>
  );
}
