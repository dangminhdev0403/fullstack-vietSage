"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { guestMarketplaceResource } from "../resources/guest-marketplace-resource";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";

export function useGuestMarketplace(sessionToken: string, categoryId?: string) {
  const { locale } = useGuestI18n();
  const resource = guestMarketplaceResource.bind({ sessionToken, locale });
  const enabled = Boolean(sessionToken);
  return {
    categories: useQuery({ ...resource.queries.categories.options(undefined as never), enabled }),
    services: useQuery({ ...resource.queries.services.options({ categoryId }), enabled }),
    orders: useQuery({ ...resource.queries.orders.options(undefined as never), enabled }),
    order: useMutation(resource.mutations.order.options()),
  };
}
