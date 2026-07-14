import { auth } from "@/auth";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { readServerSessionTokens } from "@/lib/server-session-tokens";

import { OwnerShell } from "../_components/owner-shell";
import { OwnerHotelsClient } from "./owner-hotels-client";

export const dynamic = "force-dynamic";

export default async function OwnerHotelsPage() {
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = "/owner/hotels" as const;

  const sidebarItems = await resolveDashboardNavigation({
    roles: session?.user.roles ?? [],
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken,
    authError: session?.authError ?? null,
  });

  return (
    <OwnerShell activePath={callbackUrl} navItems={sidebarItems} subtitle="Quản lý khách sạn">
      <header className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-[0_18px_60px_rgba(31,61,53,0.10)] backdrop-blur md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#bf7836]">Owner portfolio</p>
        <h1 className="vs-display mt-3 text-5xl font-semibold leading-none tracking-[-0.05em] text-[#17201b] md:text-6xl">Khách sạn của bạn</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">
          Theo dõi và cập nhật các khách sạn hiện có. Giao diện mới tập trung vào trạng thái vận hành, tìm kiếm nhanh và lối vào quản lý rõ ràng hơn.
        </p>
      </header>

      <OwnerHotelsClient />
    </OwnerShell>
  );
}
