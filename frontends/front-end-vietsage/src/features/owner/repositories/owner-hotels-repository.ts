import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelsPage } from "@/features/admin/types/admin-contract";

export type OwnerHotelsListInput = {
  page: number;
  limit: number;
};

type RepositoryRequestOptions = {
  signal?: AbortSignal;
};

export const ownerHotelsRepository = {
  async list(
    input: OwnerHotelsListInput,
    options: RepositoryRequestOptions = {},
  ): Promise<HotelsPage> {
    const params = new URLSearchParams({
      page: String(input.page),
      limit: String(input.limit),
    });
    const payload = await requestInternalApiEnvelope<HotelsPage>(
      `/api/owner/hotels?${params.toString()}`,
      {
        method: "GET",
        signal: options.signal,
      },
    );

    return payload.data;
  },
};
