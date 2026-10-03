import { notFound, redirect } from "next/navigation";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

import { AdminChannelManagerClient } from "./admin-channel-manager-client";

export default async function AdminChannelManagerPage() {
  const callbackUrl = "/admin/channel-manager" as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const persona = resolveWorkspacePersona(context.activeRole.code);

  if (persona === "platform_finance") redirect("/finance/billing");
  if (persona !== "platform_admin") notFound();

  const canManage =
    Array.isArray(context.permissions) &&
    context.permissions.includes("platform.hotels.manage");

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
          Trung tâm điều phối hạm đội kênh phân phối: theo dõi sự cố toàn hệ thống,
          cấu hình liên kết Channex và xử lý đồng bộ theo từng khách sạn.
        </p>
      </header>

      <AdminChannelManagerClient canManage={canManage} />
    </div>
  );
}
