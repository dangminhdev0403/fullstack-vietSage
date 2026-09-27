import type { Session } from "next-auth";

import { executeOwnerBackendRequest } from "@/app/api/owner/_utils";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { resolveIntakeAuthorizationMode } from "../intake/intake-authorization";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import {
  FRONTDESK_HN2N_CCCD_SCANNER,
  hasHotelFeature,
} from "@/features/hotel-features/hotel-features";

export async function authorizeHotelWorkstation(
  session: Session,
  hotelId: string,
  options?: { requireFeature?: boolean },
): Promise<Response | null> {
  const requireFeature = options?.requireFeature ?? false;
  if (
    resolveIntakeAuthorizationMode(session.activeRoleCode) === "owner-backend"
  ) {
    const authorized = await executeOwnerBackendRequest(
      "authorize owner workstation",
      async (accessToken) => {
        await hotelOpsService.listRooms(hotelId, {
          query: { page: 1, limit: 1 },
          accessToken,
        });
        return loadServerWorkspaceContext(
          `/owner/hotels/${encodeURIComponent(hotelId)}/rooms`,
          accessToken,
        );
      },
    );
    if (authorized instanceof Response) return authorized;
    if (
      requireFeature &&
      !hasHotelFeature(
        authorized.accessibleHotels.find((hotel) => hotel.id === hotelId)
          ?.enabledFeatures,
        FRONTDESK_HN2N_CCCD_SCANNER,
      )
    ) {
      return Response.json(
        {
          error:
            "Tính năng máy quét CCCD HN2N chưa được kích hoạt cho khách sạn này",
        },
        { status: 403 },
      );
    }
    return null;
  }

  const callbackUrl = `/hotels/${encodeURIComponent(hotelId)}/rooms` as const;
  const execute = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspace = await execute(
    "authorize hotel workstation",
    (accessToken) => {
      if (!accessToken) throw new Error("Missing access token");
      return loadServerWorkspaceContext(callbackUrl, accessToken);
    },
  );
  const canScan =
    workspace.permissions.includes("hotel.stays.manage") ||
    workspace.permissions.includes("hotel.stays.check-in");
  if (!canUseHotelId(workspace, hotelId) || !canScan) {
    return Response.json(
      { error: "Không có quyền sử dụng máy quét cho khách sạn này" },
      { status: 403 },
    );
  }

  if (requireFeature) {
    const selectedHotel = workspace.accessibleHotels.find(
      (hotel) => hotel.id === hotelId,
    );
    if (
      !hasHotelFeature(
        selectedHotel?.enabledFeatures,
        FRONTDESK_HN2N_CCCD_SCANNER,
      )
    ) {
      return Response.json(
        {
          error:
            "Tính năng máy quét CCCD HN2N chưa được kích hoạt cho khách sạn này",
        },
        { status: 403 },
      );
    }
  }

  return null;
}
