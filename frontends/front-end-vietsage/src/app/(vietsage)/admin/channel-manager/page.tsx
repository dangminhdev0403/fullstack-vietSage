import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

import { AdminChannelManagerClient } from "./admin-channel-manager-client";

export default async function AdminChannelManagerPage() {
  const callbackUrl = "/admin/channel-manager" as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const persona = resolveWorkspacePersona(context.activeRole.code);

  if (persona === "platform_finance") redirect("/finance/billing");
  if (persona !== "platform_admin") notFound();

  const session = await auth();
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const hotelsPage = await authorizedApi("list hotels", (accessToken) =>
    adminService.listHotels({
      query: { page: 1, limit: 100 },
      accessToken,
    }),
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
          Vận hành nền tảng
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--primary)]">
          Channel Manager
        </h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Thiết lập Channex, quản lý giá và quỹ phòng, kết nối OTA theo từng
          khách sạn.
        </p>
      </header>

      <AdminChannelManagerClient initialHotels={hotelsPage.items} />
    </div>
  );
}
