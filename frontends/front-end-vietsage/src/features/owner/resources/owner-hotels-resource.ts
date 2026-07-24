import {
  createResource,
  defineQuery,
  type ResourceQueryContext,
} from "@dangminhdev/query-resource";

import type { HotelsPage } from "@/features/admin/types/admin-contract";
import {
  ownerHotelsRepository,
  type OwnerHotelsListInput,
} from "@/features/owner/repositories/owner-hotels-repository";

export const OWNER_HOTELS_LIST_INPUT = {
  page: 1,
  limit: 100,
} as const satisfies OwnerHotelsListInput;

async function listOwnerHotels({
  input,
  signal,
}: ResourceQueryContext<
  void,
  OwnerHotelsListInput
>): Promise<HotelsPage> {
  return ownerHotelsRepository.list(input, { signal });
}

export const ownerHotelsResource = createResource<void>()({
  namespace: ["vietsage"],
  name: "hotels",
  scopeKey: () => ["owner"],
  queries: {
    list: defineQuery({
      inputKey: (input: OwnerHotelsListInput) => [
        { page: input.page, limit: input.limit },
      ],
      queryFn: listOwnerHotels,
    }),
  },
});
