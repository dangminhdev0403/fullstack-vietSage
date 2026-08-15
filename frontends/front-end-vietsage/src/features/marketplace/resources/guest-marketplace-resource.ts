import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { guestMarketplaceRepository } from "../repositories/guest-marketplace-repository";
import type {
  AddMarketplaceCartItemInput,
  CheckoutMarketplaceCartInput,
  ConfirmMarketplaceCartInput,
  CreateMarketplaceOrderInput,
  SyncMarketplaceCartInput,
  UpdateMarketplaceCartItemInput,
} from "../types/marketplace-contract";

export const guestMarketplaceResource = createResource<{ sessionToken: string; locale?: string }>()({
  namespace: ["vietsage"],
  name: "guest-marketplace",
  scopeKey: ({ sessionToken, locale }) => ["session", sessionToken, locale ?? "vi"],
  queries: {
    categories: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope }) => guestMarketplaceRepository.categories(scope.sessionToken, scope.locale),
    }),
    services: defineQuery({
      inputKey: (input: { categoryId?: string }) => [input.categoryId ?? null],
      queryFn: ({ scope, input }) => guestMarketplaceRepository.services(scope.sessionToken, input.categoryId, scope.locale),
    }),
    serviceDetail: defineQuery({
      inputKey: (input: { serviceId: string }) => [input.serviceId],
      queryFn: ({ scope, input }) => guestMarketplaceRepository.serviceDetail(scope.sessionToken, input.serviceId, scope.locale),
    }),
    orders: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope }) => guestMarketplaceRepository.orders(scope.sessionToken, scope.locale),
    }),
    orderDetail: defineQuery({
      inputKey: (input: { orderId: string }) => [input.orderId],
      queryFn: ({ scope, input }) => guestMarketplaceRepository.orderDetail(scope.sessionToken, input.orderId, scope.locale),
    }),
    cart: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope }) => guestMarketplaceRepository.cart(scope.sessionToken, scope.locale),
    }),
  },
  mutations: {
    order: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: CreateMarketplaceOrderInput }) =>
        guestMarketplaceRepository.order(scope.sessionToken, variables, scope.locale),
      invalidates: [{ type: "query", operation: "orders" }],
    }),
    checkoutCart: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: CheckoutMarketplaceCartInput }) =>
        guestMarketplaceRepository.checkoutCart(scope.sessionToken, variables, scope.locale),
      invalidates: [{ type: "query", operation: "orders" }, { type: "query", operation: "cart" }],
    }),
    confirmCart: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: ConfirmMarketplaceCartInput }) =>
        guestMarketplaceRepository.confirmCart(scope.sessionToken, variables, scope.locale),
      invalidates: [{ type: "query", operation: "orders" }, { type: "query", operation: "cart" }],
    }),
    addCartItem: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: AddMarketplaceCartItemInput }) =>
        guestMarketplaceRepository.addCartItem(scope.sessionToken, variables, scope.locale),
      invalidates: [{ type: "query", operation: "cart" }],
    }),
    updateCartItem: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: { itemId: string; input: UpdateMarketplaceCartItemInput } }) =>
        guestMarketplaceRepository.updateCartItem(scope.sessionToken, variables.itemId, variables.input, scope.locale),
      invalidates: [{ type: "query", operation: "cart" }],
    }),
    removeCartItem: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: { itemId: string } }) =>
        guestMarketplaceRepository.removeCartItem(scope.sessionToken, variables.itemId, scope.locale),
      invalidates: [{ type: "query", operation: "cart" }],
    }),
    clearCart: defineMutation({
      mutationFn: ({ scope }: { scope: { sessionToken: string; locale?: string }; variables?: void }) =>
        guestMarketplaceRepository.clearCart(scope.sessionToken, scope.locale),
      invalidates: [{ type: "query", operation: "cart" }],
    }),
    syncCart: defineMutation({
      mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: SyncMarketplaceCartInput }) =>
        guestMarketplaceRepository.syncCart(scope.sessionToken, variables, scope.locale),
      invalidates: [{ type: "query", operation: "cart" }],
    }),
  },
});
