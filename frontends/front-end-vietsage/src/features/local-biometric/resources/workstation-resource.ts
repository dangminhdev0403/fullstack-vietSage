import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";
import { workstationRepository } from "../repositories/workstation-repository";

type Scope = { hotelId: string };
type ScanInput = { scanRequestId: string };

export const workstationResource = createResource<Scope>()({
  namespace: ["vietsage"],
  name: "biometric-workstation",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    pairingStatus: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope }: ResourceQueryContext<Scope, void>) =>
        workstationRepository.getPairingStatus(scope.hotelId),
    }),
    scan: defineQuery({
      inputKey: ({ scanRequestId }: ScanInput) => ["scan", scanRequestId],
      queryFn: ({ scope, input }: ResourceQueryContext<Scope, ScanInput>) =>
        workstationRepository.readScan(input.scanRequestId, scope.hotelId),
    }),
  },
  mutations: {
    requestScan: defineMutation({
      mutationFn: ({ scope }: ResourceMutationContext<Scope, void>) =>
        workstationRepository.requestScan(scope.hotelId),
    }),
    createPairing: defineMutation({
      mutationFn: ({ scope }: ResourceMutationContext<Scope, void>) =>
        workstationRepository.createPairing(scope.hotelId),
    }),
    acknowledgeScan: defineMutation({
      mutationFn: ({ scope, variables }: ResourceMutationContext<Scope, ScanInput>) =>
        workstationRepository.acknowledgeScan(variables.scanRequestId, scope.hotelId),
    }),
    discardScan: defineMutation({
      mutationFn: ({ scope, variables }: ResourceMutationContext<Scope, ScanInput>) =>
        workstationRepository.discardScan(variables.scanRequestId, scope.hotelId),
    }),
  },
});
