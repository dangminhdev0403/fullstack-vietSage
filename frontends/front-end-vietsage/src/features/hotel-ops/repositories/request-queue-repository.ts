import { requestInternalApi } from "@/core/http/internal-api-client";
import type { HotelGuestRequest } from "../types/hotel-ops-contract";

export type RequestQueueScope = { basePath: string };
export type RequestStatusInput = {
  requestId: string;
  status: string;
  note?: string;
  assignedToUserId?: string;
};
export type RequestAssignmentInput = {
  requestId: string;
  assignedToUserId: string | null;
  note?: string;
};
export type RequestStaffOption = { id: string; name: string; role?: string };
type StaffAssignment = {
  id: string;
  fullName?: string;
  name?: string;
  role?: string;
  roles?: Array<{ name: string }>;
  user?: { id: string; fullName?: string };
};
function detailPath(scope: RequestQueueScope, requestId: string) {
  return `${scope.basePath}/${encodeURIComponent(requestId)}`;
}
export const requestQueueRepository = {
  detail(scope: RequestQueueScope, input: { requestId: string }, signal?: AbortSignal) {
    return requestInternalApi<HotelGuestRequest>(detailPath(scope, input.requestId), { method: "GET", signal });
  },
  status(scope: RequestQueueScope, { requestId, ...body }: RequestStatusInput) {
    return requestInternalApi<HotelGuestRequest>(`${detailPath(scope, requestId)}/status`, { method: "PATCH", body });
  },
  assignment(scope: RequestQueueScope, { requestId, ...body }: RequestAssignmentInput) {
    return requestInternalApi<HotelGuestRequest>(`${detailPath(scope, requestId)}/assignment`, { method: "PATCH", body });
  },
  note(scope: RequestQueueScope, { requestId, note }: { requestId: string; note: string }) {
    return requestInternalApi<unknown>(`${detailPath(scope, requestId)}/events`, { method: "POST", body: { note } });
  },
  async staffOptions(hotelId: string, signal?: AbortSignal): Promise<RequestStaffOption[]> {
    const data = await requestInternalApi<{ items?: StaffAssignment[] }>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/staff-assignments?limit=100`,
      { method: "GET", signal },
    );
    return (data?.items ?? []).map((user) => ({
      id: user.user?.id || user.id,
      name: user.user?.fullName || user.fullName || user.name || "Nhân viên",
      role: user.roles?.[0]?.name || user.role,
    }));
  },
};
