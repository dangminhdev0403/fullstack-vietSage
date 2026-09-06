import { createResource, defineMutation, defineQuery, type ResourceMutationContext, type ResourceQueryContext } from "@dangminhdev04032005/query-resource";
import { mobileShiftRepository } from "../repositories/mobile-shift-repository";
import type { DesktopCommand, PhoneCommand } from "../workstation/mobile-shift-security";
type Scope = { hotelId: string; deskId: string };
export const mobileShiftResource = createResource<Scope>()({
  namespace: ["vietsage"], name: "cccd-mobile-shift", scopeKey: ({ hotelId, deskId }) => [hotelId, deskId],
  queries: {
    desk: defineQuery({ inputKey: () => [], queryFn: ({ scope }: ResourceQueryContext<Scope, void>) => mobileShiftRepository.desk(scope.hotelId, scope.deskId) }),
    phone: defineQuery({ inputKey: () => [], queryFn: (context: ResourceQueryContext<Scope, void>) => { void context; return mobileShiftRepository.phone(); } }),
  },
  mutations: {
    desk: defineMutation({ mutationFn: ({ scope, variables }: ResourceMutationContext<Scope, DesktopCommand>) => mobileShiftRepository.command(scope.hotelId, variables) }),
    phone: defineMutation({ mutationFn: ({ variables }: ResourceMutationContext<Scope, PhoneCommand>) => mobileShiftRepository.phone(variables) }),
  },
});
