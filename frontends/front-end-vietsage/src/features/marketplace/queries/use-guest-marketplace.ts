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
    cart: useQuery({ ...resource.queries.cart.options(undefined as never), enabled }),
    order: useMutation(resource.mutations.order.options()),
    checkoutCart: useMutation(resource.mutations.checkoutCart.options()),
    confirmCart: useMutation(resource.mutations.confirmCart.options()),
    addCartItem: useMutation(resource.mutations.addCartItem.options()),
    updateCartItem: useMutation(resource.mutations.updateCartItem.options()),
    removeCartItem: useMutation(resource.mutations.removeCartItem.options()),
    clearCart: useMutation(resource.mutations.clearCart.options()),
    syncCart: useMutation(resource.mutations.syncCart.options()),
  };
}

export function useGuestMarketplaceService(sessionToken: string, serviceId?: string) {
  const { locale } = useGuestI18n();
  const resource = guestMarketplaceResource.bind({ sessionToken, locale });
  const enabled = Boolean(sessionToken && serviceId);
  return useQuery({
    ...resource.queries.serviceDetail.options({ serviceId: serviceId ?? "" }),
    enabled,
  });
}

export function useGuestMarketplaceOrder(sessionToken: string, orderId?: string) {
  const { locale } = useGuestI18n();
  const resource = guestMarketplaceResource.bind({ sessionToken, locale });
  const enabled = Boolean(sessionToken && orderId);
  return useQuery({
    ...resource.queries.orderDetail.options({ orderId: orderId ?? "" }),
    enabled,
  });
}

export function useGuestMarketplaceCart(
  sessionToken: string,
  options?: { enabled?: boolean },
) {
  const { locale } = useGuestI18n();
  const resource = guestMarketplaceResource.bind({ sessionToken, locale });
  const enabled = Boolean(sessionToken && (options?.enabled ?? true));
  return useQuery({
    ...resource.queries.cart.options(undefined as never),
    enabled,
    staleTime: 10_000,
  });
}

export function useGuestMarketplaceCartQuote(
  sessionToken: string,
  items?: Array<{ serviceId: string; quantity: number }>,
  options?: { enabled?: boolean },
) {
  return useGuestMarketplaceCart(sessionToken, options);
}
