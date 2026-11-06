"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestQueueResource } from "../resources/request-queue-resource";
import type { HotelGuestRequest } from "../types/hotel-ops-contract";

export function useRequestDetail(basePath: string, hotelId: string, initialRequest: HotelGuestRequest) {
  const client = useQueryClient();
  const resource = requestQueueResource.bind({ basePath });
  const input = { requestId: initialRequest.id };
  const detail = useQuery({
    ...resource.queries.detail.options(input),
    initialData: initialRequest,
    refetchOnMount: false,
  });
  const staff = useQuery(resource.queries.staffOptions.options({ hotelId }));
  const status = useMutation(resource.mutations.status.options({
    onSuccess: ({ data, cache }) => { cache.queries.detail.set(client, { requestId: data.id }, data); },
  }));
  const assignment = useMutation(resource.mutations.assignment.options({
    onSuccess: ({ data, cache }) => { cache.queries.detail.set(client, { requestId: data.id }, data); },
  }));
  const note = useMutation(resource.mutations.note.options());
  return { request: detail.data, staff: staff.data ?? [], status, assignment, note,
    reload: () => client.fetchQuery({ ...resource.queries.detail.options(input), staleTime: 0 }),
  };
}
