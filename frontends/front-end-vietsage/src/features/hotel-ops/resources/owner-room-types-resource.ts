import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { ownerRoomTypesRepository } from "../repositories/owner-room-types-repository";

type Scope = { hotelId: string };

export const ownerRoomTypesResource = createResource<Scope>()({
  namespace: ["vietsage"],
  name: "owner-room-types",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (_input: void) => [],
      queryFn: ({ scope, signal }) => ownerRoomTypesRepository.list(scope.hotelId, signal),
    }),
  },
  mutations: {
    create: defineMutation({
      mutationFn: ({ scope, variables }: { scope: Scope; variables: { name: string; basePrice: number } }) =>
        ownerRoomTypesRepository.create(scope.hotelId, variables),
    }),
    updatePrice: defineMutation({
      mutationFn: ({ scope, variables }: { scope: Scope; variables: { roomTypeId: string; basePrice: number } }) =>
        ownerRoomTypesRepository.updatePrice(scope.hotelId, variables),
    }),
  },
});
