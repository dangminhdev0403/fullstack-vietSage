import { notFound, redirect } from "next/navigation";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
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
      <header className="rounded-[1.4rem] border border-[#e8dfd1] bg-white/90 p-6 shadow-[0_12px_36px_rgba(23,32,27,0.04)] backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start sm:items-center gap-4">
            <div className="grid h-12 w-12 sm:h-14 sm:w-14 shrink-0 place-items-center rounded-2xl bg-[#24473d] text-[#e8b363] shadow-md shadow-[#24473d]/20 ring-2 ring-[#e8b363]/30">
              <VsIcon name="hub" className="text-2xl sm:text-3xl" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dfd1] bg-[#fbf8f2] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#735c00]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e8b363]" />
                Vận hành nền tảng • Channel Manager
              </div>
              <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#17201b]">
                Channel Manager
              </h1>
              <p className="mt-1 max-w-3xl text-sm sm:text-base text-[#69726b] leading-relaxed">
                Trung tâm điều phối hạm đội kênh phân phối: theo dõi sự cố toàn hệ thống, cấu hình liên kết Channex và xử lý đồng bộ theo từng khách sạn.
              </p>
            </div>
          </div>
        </div>
      </header>

      <AdminChannelManagerClient canManage={canManage} />
    </div>
  );
}
