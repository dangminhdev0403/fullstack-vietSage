"use client";

import { useMutation } from "@tanstack/react-query";
import { localPartnersResource } from "@/features/local-partners/resources/local-partners-resource";
import { requestQueueResource } from "../resources/request-queue-resource";

export function useRequestQueueActions(basePath: string, hotelId: string) {
  const requests = requestQueueResource.bind({ basePath });
  const partners = localPartnersResource.bind({ hotelId });
  return {
    status: useMutation(requests.mutations.status.options()),
    acknowledgeOrder: useMutation(partners.mutations.acknowledgeOrder.options()),
    cancelOrder: useMutation(partners.mutations.cancelOrder.options()),
  };
}
