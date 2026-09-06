import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { HotelsPage } from "@/features/admin/types/admin-contract";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

import { OwnerHotelsClient } from "./owner-hotels-client";

export const dynamic = "force-dynamic";

export default async function OwnerHotelsPage() {
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = "/owner/hotels" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(
    callbackUrl,
    tokens.accessToken,
  );
  const persona = resolveWorkspacePersona(workspaceContext.activeRole.code);
  if (persona !== "owner") notFound();

  let initialHotels: HotelsPage | undefined;
  try {
    initialHotels = await authorizedApi("list owner hotels", (accessToken) =>
      adminService.listHotels({ query: { page: 1, limit: 100 }, accessToken }),
    );
  } catch (error) {
    console.error("[OWNER_HOTELS_PAGE_ERROR]", error);
  }

  return (
    <>
      <header className="vs-page-header rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-[0_18px_60px_rgba(31,61,53,0.10)] backdrop-blur md:p-8">
        <h1 className="vs-display mt-3 text-5xl font-semibold leading-none tracking-[-0.05em] text-[#17201b] md:text-6xl">Khách sạn của bạn</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">
          Theo dõi trạng thái vận hành, tìm kiếm và mở không gian quản lý của từng khách sạn.
        </p>
      </header>

      <OwnerHotelsClient initialHotels={initialHotels} />
    </>
  );
}
