import {
  createResource,
  defineQuery,
  defineMutation,
  type ResourceQueryContext,
  type ResourceMutationContext,
} from "@dangminhdev04032005/query-resource";
import { revenueBookRepository } from "../repositories/revenue-book-repository";
import type {
  CollectRevenueInput,
  CreateRevenueEntryInput,
  RevenueBookQuery,
  UpdateRevenueEntryInput,
  VoidRevenueEntryInput,
} from "../types/revenue-book-contract";

type Scope = { hotelId: string };
export const revenueBookResource = createResource<Scope>()({
  namespace: ["vietsage"],
  name: "hotel-revenue-book",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (input: RevenueBookQuery) => [input.from ?? "", input.to ?? ""],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<Scope, RevenueBookQuery>) =>
        revenueBookRepository.list(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    create: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<Scope, CreateRevenueEntryInput>) =>
        revenueBookRepository.create(scope.hotelId, variables),
      invalidates: [{ type: "query", operation: "list" }],
    }),
    update: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        Scope,
        { id: string; body: UpdateRevenueEntryInput }
      >) =>
        revenueBookRepository.update(
          scope.hotelId,
          variables.id,
          variables.body,
        ),
      invalidates: [{ type: "query", operation: "list" }],
    }),
    collect: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        Scope,
        { id: string; body: CollectRevenueInput }
      >) =>
        revenueBookRepository.collect(
          scope.hotelId,
          variables.id,
          variables.body,
        ),
      invalidates: [{ type: "query", operation: "list" }],
    }),
    void: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        Scope,
        { id: string; body: VoidRevenueEntryInput }
      >) =>
        revenueBookRepository.void(scope.hotelId, variables.id, variables.body),
      invalidates: [{ type: "query", operation: "list" }],
    }),
  },
});
