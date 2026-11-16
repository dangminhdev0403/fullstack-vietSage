import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";
import { kbttRepository } from "../repositories/kbtt-repository";
import type { PaginatedKbttDeclarations } from "../repositories/kbtt-repository";
import type {
  KbttReconciliation,
  KbttAutoSubmitConfig,
  KbttAutoSubmitEnabled,
  KbttAutoSubmitState,
  KbttBatchSubmitSummary,
  KbttCatalogItem,
  KbttCatalogKind,
  KbttConnection,
  KbttCredentials,
  KbttDailyMovementsQuery,
  KbttDailyMovementsResponse,
  KbttDeclarationRecord,
  KbttDevOccupantUpdateItem,
  KbttOccupantDeclarationDetail,
  KbttPaginationQuery,
  SaveKbttDraftPayload,
} from "../types/kbtt-contract";

type HotelScope = { hotelId: string };
const connectionInvalidates = [
  { type: "query", operation: "reconciliation" },
  { type: "query", operation: "reconciliationLocal" },
  { type: "query", operation: "connection" },
] as const;
const declarationInvalidates = [
  { type: "query", operation: "reconciliation" },
  { type: "query", operation: "inHouseDeclarations" },
  { type: "query", operation: "declarations" },
  { type: "query", operation: "declarationDetail" },
] as const;

export const kbttResource = createResource<HotelScope>()({
  namespace: ["vietsage"],
  name: "kbtt",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    reconciliationLocal: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope, signal }: ResourceQueryContext<HotelScope, void>): Promise<KbttReconciliation> =>
        kbttRepository.reconciliation(scope.hotelId, signal, false, true),
    }),
    reconciliation: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope, signal }: ResourceQueryContext<HotelScope, void>): Promise<KbttReconciliation> =>
        kbttRepository.reconciliation(scope.hotelId, signal, true),
    }),
    inHouseDeclarations: defineQuery({
      inputKey: ({ stayIds }: { stayIds: string }) => [stayIds],
      queryFn: async ({ scope, input, signal }: ResourceQueryContext<HotelScope, { stayIds: string }>) => {
        const first = await kbttRepository.listDeclarations(scope.hotelId, { stayIds: input.stayIds, page: 1, limit: 100 }, signal);
        if (first.total === undefined || first.totalPages === undefined) throw new Error("Không xác định được số hồ sơ BCA.");
        const items = [...first];
        for (let page = 2; page <= first.totalPages; page += 1) {
          const next = await kbttRepository.listDeclarations(scope.hotelId, { stayIds: input.stayIds, page, limit: 100 }, signal);
          if (next.total !== first.total) throw new Error("Danh sách BCA vừa thay đổi. Vui lòng làm mới.");
          items.push(...next);
        }
        if (items.length !== first.total || new Set(items.map((item) => item.occupantId)).size !== items.length) throw new Error("Chưa tải đủ hồ sơ BCA. Vui lòng làm mới.");
        return Object.assign(items, { delivery: first.delivery });
      },
    }),
    connection: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
        signal,
      }: ResourceQueryContext<HotelScope, void>): Promise<KbttConnection> =>
        kbttRepository.connection(scope.hotelId, signal),
    }),
    declarations: defineQuery({
      // Array metadata carries delivery counters even when every row is unchanged.
      defaults: { structuralSharing: false },
      inputKey: (input: Partial<KbttPaginationQuery> = {}) => [
        input.page ?? 1,
        input.limit ?? 50,
        input.q?.trim() ?? "",
        input.status ?? "",
        input.nationality ?? "",
        input.checkInDate ?? "",
        input.stayIds ?? "",
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        HotelScope,
        Partial<KbttPaginationQuery> | undefined
      >): Promise<PaginatedKbttDeclarations> =>
        kbttRepository.listDeclarations(scope.hotelId, input, signal),
    }),
    declarationDetail: defineQuery({
      inputKey: ({ occupantId }: { occupantId: string }) => [occupantId],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        HotelScope,
        { occupantId: string }
      >): Promise<KbttOccupantDeclarationDetail> =>
        kbttRepository.getDeclaration(scope.hotelId, input.occupantId, signal),
    }),
    catalog: defineQuery({
      inputKey: ({
        kind,
        parentCode,
      }: {
        kind: KbttCatalogKind;
        parentCode?: string;
      }) => [kind, parentCode ?? ""],
      queryFn: ({
        input,
        signal,
      }: ResourceQueryContext<
        HotelScope,
        { kind: KbttCatalogKind; parentCode?: string }
      >): Promise<KbttCatalogItem[]> =>
        kbttRepository.listCatalog(input.kind, input.parentCode, signal),
    }),
    autoSubmitEnabled: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope, signal }: ResourceQueryContext<HotelScope, void>): Promise<KbttAutoSubmitEnabled> =>
        kbttRepository.getAutoSubmitEnabled(scope.hotelId, signal),
    }),
    autoSubmitConfig: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
        signal,
      }: ResourceQueryContext<HotelScope, void>): Promise<KbttAutoSubmitState> =>
        kbttRepository.getAutoSubmitConfig(scope.hotelId, signal),
    }),
    dailyMovements: defineQuery({
      inputKey: (input: KbttDailyMovementsQuery) => [
        input.date,
        input.kind,
        input.q ?? "",
        input.page ?? 1,
        input.limit ?? 50,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        HotelScope,
        KbttDailyMovementsQuery
      >): Promise<KbttDailyMovementsResponse> =>
        kbttRepository.dailyMovements(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    refreshReconciliation: defineMutation({
      defaults: { retry: false },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>): Promise<KbttReconciliation> =>
        kbttRepository.reconciliation(scope.hotelId, undefined, true),
    }),
    connect: defineMutation({
      defaults: { gcTime: 0, retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HotelScope,
        KbttCredentials
      >): Promise<KbttConnection> =>
        kbttRepository.connect(scope.hotelId, variables),
      invalidates: connectionInvalidates,
    }),
    check: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
      }: ResourceMutationContext<HotelScope, void>): Promise<KbttConnection> =>
        kbttRepository.check(scope.hotelId),
      invalidates: connectionInvalidates,
    }),
    disconnect: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
      }: ResourceMutationContext<HotelScope, void>): Promise<KbttConnection> =>
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
        kbttRepository.saveDraft(
          scope.hotelId,
          variables.occupantId,
          variables.body,
        ),
      invalidates: declarationInvalidates,
    }),
    submit: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HotelScope,
        { occupantId: string }
      >): Promise<KbttDeclarationRecord> =>
        kbttRepository.submit(scope.hotelId, variables.occupantId),
      invalidates: declarationInvalidates,
    }),
    updateAutoSubmitEnabled: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope, variables }: ResourceMutationContext<HotelScope, KbttAutoSubmitEnabled>) =>
        kbttRepository.updateAutoSubmitEnabled(scope.hotelId, variables),
      invalidates: [
        { type: "query", operation: "autoSubmitEnabled" },
        { type: "query", operation: "autoSubmitConfig" },
        ...declarationInvalidates,
      ],
    }),
    updateAutoSubmitConfig: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<HotelScope, KbttAutoSubmitConfig>) =>
        kbttRepository.updateAutoSubmitConfig(scope.hotelId, variables),
      invalidates: [
        { type: "query", operation: "autoSubmitConfig" },
        { type: "query", operation: "autoSubmitEnabled" },
        ...declarationInvalidates,
      ],
    }),
    testAutoSubmit: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<HotelScope, { dryRun?: boolean } | void>) =>
        kbttRepository.testAutoSubmit(scope.hotelId, variables?.dryRun ?? true),
      invalidates: [
        { type: "query", operation: "autoSubmitConfig" },
        { type: "query", operation: "declarations" },
        { type: "query", operation: "declarationDetail" },
      ],
    }),
    testTelegram: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>) =>
        kbttRepository.testTelegram(scope.hotelId),
    }),
    sendBatchSummary: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<HotelScope, KbttBatchSubmitSummary>) =>
        kbttRepository.sendBatchSummary(scope.hotelId, variables),
    }),
    scheduleAutoSubmit: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope, variables }: ResourceMutationContext<HotelScope, { mode: "dry-run" | "live" }>) =>
        kbttRepository.scheduleAutoSubmit(scope.hotelId, variables.mode),
      invalidates: [
        { type: "query", operation: "autoSubmitConfig" },
        { type: "query", operation: "declarations" },
        { type: "query", operation: "declarationDetail" },
      ],
    }),
    cancelScheduledAutoSubmit: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>) =>
        kbttRepository.cancelScheduledAutoSubmit(scope.hotelId),
      invalidates: [
        { type: "query", operation: "autoSubmitConfig" },
        { type: "query", operation: "declarations" },
        { type: "query", operation: "declarationDetail" },
      ],
    }),
    devResetDeclarations: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HotelScope,
        { generateNewIdentityNumbers?: boolean } | void
      >) =>
        kbttRepository.devResetDeclarations(
          scope.hotelId,
          variables
            ? {
                generateNewIdentityNumbers:
                  variables.generateNewIdentityNumbers,
              }
            : undefined,
        ),
      invalidates: declarationInvalidates,
    }),
    devUpdateOccupants: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HotelScope,
        { occupants: KbttDevOccupantUpdateItem[] }
      >) =>
        kbttRepository.devUpdateOccupants(scope.hotelId, variables.occupants),
      invalidates: declarationInvalidates,
    }),
  },
});
