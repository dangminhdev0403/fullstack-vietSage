import "server-only";

import type { Session } from "next-auth";

import { hotelOpsService } from "./hotel-ops-service-instance";
import type {
  StaffRequestListItem,
  StaffRequestSummaryResponse,
} from "../types/hotel-ops-contract";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

export type StaffDashboardData = {
  requests: StaffRequestListItem[];
  requestSummary: StaffRequestSummaryResponse | null;
  totalRequests: number;
  totalCategories: number;
  totalItems: number;
};

type LoadStaffDashboardDataInput = {
  session: Session | null;
  hotelId: string | null;
  callbackUrl: `/${string}`;
  includeRequests: boolean;
  includeServices: boolean;
};

const EMPTY_STAFF_DASHBOARD_DATA: StaffDashboardData = {
  requests: [],
  requestSummary: null,
  totalRequests: 0,
  totalCategories: 0,
  totalItems: 0,
};

export async function loadStaffDashboardData(
  input: LoadStaffDashboardDataInput,
): Promise<StaffDashboardData> {
  if (!input.session || !input.hotelId || (!input.includeRequests && !input.includeServices)) {
    return EMPTY_STAFF_DASHBOARD_DATA;
  }

  const hotelId = input.hotelId;
  const authorizedApi = createAuthorizedApiExecutor({
    session: input.session,
    callbackUrl: input.callbackUrl,
  });
  const requestDataPromise = input.includeRequests
    ? Promise.all([
        authorizedApi("list staff requests", (accessToken) =>
          hotelOpsService.listRequests(hotelId, {
            query: { page: 1, limit: 8 },
            accessToken,
          }),
        ),
        authorizedApi("summarize staff requests", (accessToken) =>
          hotelOpsService.getRequestsSummary(hotelId, { accessToken }),
        ),
      ])
    : null;
  const serviceDataPromise = input.includeServices
    ? Promise.all([
        authorizedApi("list staff service categories", (accessToken) =>
          hotelOpsService.listServiceCategories(hotelId, {
            query: { page: 1, limit: 1 },
            accessToken,
          }),
        ),
        authorizedApi("list staff service items", (accessToken) =>
          hotelOpsService.listServiceItems(hotelId, {
            query: { page: 1, limit: 1 },
            accessToken,
          }),
        ),
      ])
    : null;

  const [requestData, serviceData] = await Promise.all([
    requestDataPromise,
    serviceDataPromise,
  ]);

  return {
    requests: requestData?.[0].items ?? [],
    requestSummary: requestData?.[1] ?? null,
    totalRequests: requestData?.[0].total ?? 0,
    totalCategories: serviceData?.[0].total ?? 0,
    totalItems: serviceData?.[1].total ?? 0,
  };
}
