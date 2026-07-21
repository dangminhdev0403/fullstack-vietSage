import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { ArrivalsClient } from "./arrivals-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function HotelArrivalsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/arrivals` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const canView = context.permissions.includes("hotel.reservations.view") || context.permissions.includes("hotel.reservations.manage");
  if (!canUseHotelId(context, hotelId) || !canView) notFound();

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const [arrivals, rooms] = await Promise.all([
    authorizedApi("list hotel arrivals", (accessToken) =>
      hotelOpsService.listArrivals(hotelId, { query: { from: from.toISOString(), to: to.toISOString(), page: 1, limit: 100 }, accessToken }),
    ),
    authorizedApi("list rooms for arrivals", (accessToken) =>
      hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    ),
  ]);

  return (
    <ArrivalsClient
      hotelId={hotelId}
      arrivals={arrivals.items}
      rooms={rooms.items}
      canManage={context.permissions.includes("hotel.reservations.manage")}
    />
  );
}
