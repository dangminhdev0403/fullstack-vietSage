import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";
import { kbttRepository } from "../repositories/kbtt-repository";
import type {
  KbttCatalogItem,
  KbttCatalogKind,
  KbttConnection,
  KbttCredentials,
  KbttDeclarationListItem,
  KbttDeclarationRecord,
  KbttOccupantDeclarationDetail,
  SaveKbttDraftPayload,
} from "../types/kbtt-contract";

type HotelScope = { hotelId: string };
const connectionInvalidates = [{ type: "query", operation: "connection" }] as const;
const declarationInvalidates = [
  { type: "query", operation: "declarations" },
  { type: "query", operation: "declarationDetail" },
] as const;

export const kbttResource = createResource<HotelScope>()({
  namespace: ["vietsage"],
  name: "kbtt",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    connection: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope, signal }: ResourceQueryContext<HotelScope, void>): Promise<KbttConnection> =>
        kbttRepository.connection(scope.hotelId, signal),
    }),
    declarations: defineQuery({
      inputKey: (input: { page?: number; limit?: number } = {}) => [input.page ?? 1, input.limit ?? 50],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<HotelScope, { page?: number; limit?: number } | undefined>): Promise<
        KbttDeclarationListItem[]
      > => kbttRepository.listDeclarations(scope.hotelId, input, signal),
    }),
    declarationDetail: defineQuery({
      inputKey: ({ occupantId }: { occupantId: string }) => [occupantId],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<HotelScope, { occupantId: string }>): Promise<
        KbttOccupantDeclarationDetail
      > => kbttRepository.getDeclaration(scope.hotelId, input.occupantId, signal),
    }),
    catalog: defineQuery({
      inputKey: ({ kind, parentCode }: { kind: KbttCatalogKind; parentCode?: string }) => [
        kind,
        parentCode ?? "",
      ],
      queryFn: ({ scope, input, signal }: ResourceQueryContext<
        HotelScope,
        { kind: KbttCatalogKind; parentCode?: string }
      >): Promise<KbttCatalogItem[]> =>
        kbttRepository.listCatalog(scope.hotelId, input.kind, input.parentCode, signal),
    }),
  },
  mutations: {
    connect: defineMutation({
      defaults: { gcTime: 0, retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<HotelScope, KbttCredentials>): Promise<KbttConnection> =>
        kbttRepository.connect(scope.hotelId, variables),
      invalidates: connectionInvalidates,
    }),
    check: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>): Promise<KbttConnection> =>
        kbttRepository.check(scope.hotelId),
      invalidates: connectionInvalidates,
    }),
    disconnect: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>): Promise<KbttConnection> =>
        kbttRepository.disconnect(scope.hotelId),
      invalidates: connectionInvalidates,
    }),
    saveDraft: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HotelScope,
        { occupantId: string; body: SaveKbttDraftPayload }
      >): Promise<KbttDeclarationRecord> =>
        kbttRepository.saveDraft(scope.hotelId, variables.occupantId, variables.body),
      invalidates: declarationInvalidates,
    }),
    markReady: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<HotelScope, { occupantId: string }>): Promise<KbttDeclarationRecord> =>
        kbttRepository.markReady(scope.hotelId, variables.occupantId),
      invalidates: declarationInvalidates,
    }),
  },
});
