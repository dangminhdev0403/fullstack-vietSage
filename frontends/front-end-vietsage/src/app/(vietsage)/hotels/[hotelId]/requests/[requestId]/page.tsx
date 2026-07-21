import { auth } from "@/auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestDetailClient } from "./request-detail-client";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

type RequestDetailPageProps = {
  params: Promise<{ hotelId: string; requestId: string }> | { hotelId: string; requestId: string };
};

export const dynamic = "force-dynamic";

export default async function HotelRequestDetailPage({ params }: RequestDetailPageProps) {
  const { hotelId, requestId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/requests/${requestId}` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(workspaceContext, hotelId)) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const request = await authorizedApi("get hotel request", (accessToken) =>
    hotelOpsService.getRequest(hotelId, requestId, accessToken),
  );

  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href={`/hotels/${hotelId}/requests`} className="text-sm font-semibold text-[var(--primary)]">Back to queue</Link>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Hotel {hotelId}</p>
        <h1 className="vs-display text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">Request Detail</h1>
      </header>
      <RequestDetailClient
        hotelId={hotelId}
        initialRequest={request}
      />
    </>
  );
}
