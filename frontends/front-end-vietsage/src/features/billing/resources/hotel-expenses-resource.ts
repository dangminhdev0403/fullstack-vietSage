import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";
import { hotelExpensesRepository } from "../repositories/hotel-expenses-repository";
import type {
  CreateHotelExpenseInput,
  HotelExpensesQuery,
  PayHotelExpenseInput,
  UpdateHotelExpenseInput,
  VoidHotelExpenseInput,
} from "../types/hotel-expenses-contract";

type Scope = { hotelId: string };

export const hotelExpensesResource = createResource<Scope>()({
  namespace: ["vietsage"],
  name: "hotel-expenses",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (input: HotelExpensesQuery) => [
        input.from ?? "",
        input.to ?? "",
        input.category ?? "",
        input.paymentStatus ?? "",
        input.includeVoided ? "1" : "0",
      ],
      queryFn: ({ scope, input, signal }: ResourceQueryContext<Scope, HotelExpensesQuery>) =>
        hotelExpensesRepository.list(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    create: defineMutation({
      mutationFn: ({ scope, variables }: ResourceMutationContext<Scope, CreateHotelExpenseInput>) =>
        hotelExpensesRepository.create(scope.hotelId, variables),
    }),
    update: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<Scope, { expenseId: string; body: UpdateHotelExpenseInput }>) =>
        hotelExpensesRepository.update(scope.hotelId, variables.expenseId, variables.body),
    }),
    pay: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<Scope, { expenseId: string; body: PayHotelExpenseInput }>) =>
        hotelExpensesRepository.pay(scope.hotelId, variables.expenseId, variables.body),
    }),
    void: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<Scope, { expenseId: string; body: VoidHotelExpenseInput }>) =>
        hotelExpensesRepository.void(scope.hotelId, variables.expenseId, variables.body),
    }),
  },
});
