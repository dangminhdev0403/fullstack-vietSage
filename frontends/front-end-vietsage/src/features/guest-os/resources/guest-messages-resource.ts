import {
  createResource,
  defineInfiniteQuery,
  defineMutation,
  type ResourceInfiniteQueryContext,
  type ResourceMutationContext,
} from "@dangminhdev04032005/query-resource";

import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type {
  GuestLocaleCode,
  GuestMessagesResult,
} from "@/features/guest-os/types/guest-os-contract";

export type GuestMessagesScope = Readonly<{
  sessionToken: string;
  locale: GuestLocaleCode;
}>;

type HistoryInput = Readonly<{ limit: number }>;

export const guestMessagesResource = createResource<GuestMessagesScope>()({
  namespace: ["vietsage"],
  name: "guest-messages",
  scopeKey: (scope) => ["session", scope.sessionToken, "locale", scope.locale],
  infiniteQueries: {
    history: defineInfiniteQuery({
      inputKey: (input: HistoryInput) => [input],
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page: GuestMessagesResult) =>
        page.hasMore ? (page.nextCursor ?? undefined) : undefined,
      queryFn: ({ scope, input, pageParam }: ResourceInfiniteQueryContext<
        GuestMessagesScope,
        HistoryInput,
        string | undefined
      >) =>
        guestOsService.listMessages(
          scope.sessionToken,
          { before: pageParam, limit: input.limit },
          scope.locale,
        ),
    }),
  },
  mutations: {
    send: defineMutation({
      mutationFn: ({ scope, variables }: ResourceMutationContext<
        GuestMessagesScope,
        { body: string }
      >) => guestOsService.sendMessage(scope.sessionToken, variables.body, scope.locale),
      invalidates: [{ type: "infinite", operation: "history" }],
    }),
    markRead: defineMutation({
      mutationFn: ({ scope }: ResourceMutationContext<GuestMessagesScope, void>) =>
        guestOsService.markMessagesRead(scope.sessionToken, scope.locale),
    }),
  },
});
