import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { readServerSessionTokens } from "@/lib/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { withOwnerHotelNavigation } from "../../../_components/owner-navigation";
import { OwnerShell } from "../../../_components/owner-shell";
import { OwnerRoomsClient } from "./owner-rooms-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export const dynamic = "force-dynamic";

export default async function OwnerHotelRoomsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = `/owner/hotels/${hotelId}/rooms` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, roomsPage] = await Promise.all([
    resolveDashboardNavigation({
      roles: session?.user.roles ?? [],
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
      authError: session?.authError ?? null,
    }),
    authorizedApi("list owner rooms", (accessToken) => hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
  ]);

  return (
    <OwnerShell activePath={callbackUrl} navItems={withOwnerHotelNavigation(sidebarItems, hotelId)} subtitle="Phòng và QR">
      <OwnerRoomsClient hotelId={hotelId} initialRooms={roomsPage.items} />
    </OwnerShell>
  );
}
