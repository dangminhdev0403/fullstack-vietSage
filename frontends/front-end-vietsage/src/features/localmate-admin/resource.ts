import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { localMateAdminRepository } from "./repository";
import type {
  CreateLocalMateGuideInput,
  CreateLocalMateTourInput,
  LocalMateStatus,
  MatchLocalMateAiInput,
  UpdateLocalMateGuideInput,
  UpdateLocalMateTourInput,
} from "./types";

const invalidates = [{ type: "query", operation: "data" }] as const;

export const localMateAdminResource = createResource<Record<string, never>>()({
  namespace: ["vietsage"],
  name: "localmate-admin",
  scopeKey: () => [],
  queries: {
    data: defineQuery({
      inputKey: () => [],
      queryFn: () => localMateAdminRepository.data(),
    }),
  },
  mutations: {
    createGuide: defineMutation({
      mutationFn: ({ variables }: { variables: { input: CreateLocalMateGuideInput } }) =>
        localMateAdminRepository.createGuide(variables.input),
      invalidates,
    }),
    updateGuide: defineMutation({
      mutationFn: ({
        variables,
      }: {
        variables: { guideId: string; input: UpdateLocalMateGuideInput };
      }) => localMateAdminRepository.updateGuide(variables.guideId, variables.input),
      invalidates,
    }),
    updateQualification: defineMutation({
      mutationFn: ({ variables }: { variables: { guideId: string; status: LocalMateStatus } }) =>
        localMateAdminRepository.updateQualification(variables.guideId, variables.status),
      invalidates,
    }),
    createTour: defineMutation({
      mutationFn: ({ variables }: { variables: { input: CreateLocalMateTourInput } }) =>
        localMateAdminRepository.createTour(variables.input),
      invalidates,
    }),
    updateTour: defineMutation({
      mutationFn: ({
        variables,
      }: {
        variables: { tourId: string; input: UpdateLocalMateTourInput };
      }) => localMateAdminRepository.updateTour(variables.tourId, variables.input),
      invalidates,
    }),
    deleteTour: defineMutation({
      mutationFn: ({ variables }: { variables: { tourId: string } }) =>
        localMateAdminRepository.deleteTour(variables.tourId),
      invalidates,
    }),
    matchAi: defineMutation({
      mutationFn: ({ variables }: { variables: { input: MatchLocalMateAiInput } }) =>
        localMateAdminRepository.matchAi(variables.input),
    }),
  },
});

