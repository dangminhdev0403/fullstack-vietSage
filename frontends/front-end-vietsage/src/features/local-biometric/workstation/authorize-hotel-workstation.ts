import type { Session } from "next-auth";

import { executeOwnerBackendRequest } from "@/app/api/owner/_utils";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { resolveIntakeAuthorizationMode } from "../intake/intake-authorization";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export async function authorizeHotelWorkstation(session: Session, hotelId: string): Promise<Response | null> {
  if (resolveIntakeAuthorizationMode(session.activeRoleCode) === "owner-backend") {
    const authorized = await executeOwnerBackendRequest("authorize owner workstation", (accessToken) =>
      hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 1 }, accessToken }),
    );
    return authorized instanceof Response ? authorized : null;
  }

  const callbackUrl = `/hotels/${encodeURIComponent(hotelId)}/rooms` as const;
  const execute = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspace = await execute("authorize hotel workstation", (accessToken) => {
    if (!accessToken) throw new Error("Missing access token");
    return loadServerWorkspaceContext(callbackUrl, accessToken);
  });
  return canUseHotelId(workspace, hotelId) && workspace.permissions.includes("hotel.stays.manage")
    ? null
    : Response.json({ error: "Không có quyền sử dụng máy quét cho khách sạn này" }, { status: 403 });
}
