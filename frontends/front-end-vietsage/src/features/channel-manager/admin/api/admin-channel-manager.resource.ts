import {
  createResource,
  defineQuery,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import { adminChannelManagerRepository } from "./admin-channel-manager.repository";
import type {
  AdminChannelOverviewQuery,
  AdminChannelOverviewResponse,
} from "../types/admin-channel-manager.types";

export type AdminChannelManagerScope = {
  roleScope?: "admin";
};

export const adminChannelManagerResource = createResource<AdminChannelManagerScope>()({
  namespace: ["vietsage"],
  name: "admin-channel-manager",
  scopeKey: ({ roleScope = "admin" }) => [
    "admin",
    "channel-manager",
    roleScope,
  ],
  queries: {
    overview: defineQuery({
      inputKey: (query?: AdminChannelOverviewQuery) => [
        query?.q ?? "",
        query?.state ?? "",
        query?.page ?? 1,
        query?.limit ?? 25,
      ],
      queryFn: ({
        input,
        signal,
      }: ResourceQueryContext<
        AdminChannelManagerScope,
        AdminChannelOverviewQuery | undefined
      >): Promise<AdminChannelOverviewResponse> =>
        adminChannelManagerRepository.getOverview(input, signal),
    }),
  },
});
