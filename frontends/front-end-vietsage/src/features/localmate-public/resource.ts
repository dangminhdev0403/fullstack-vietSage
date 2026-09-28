import { createResource, defineMutation } from "@dangminhdev04032005/query-resource";
import { publicLocalMateRepository } from "./repository";
import type { PublicLocalMateChatInput } from "./types";

export const publicLocalMateResource = createResource<Record<string, never>>()({
  namespace: ["vietsage"],
  name: "localmate-public",
  scopeKey: () => [],
  mutations: {
    chat: defineMutation({
      mutationFn: ({ variables }: { variables: { input: PublicLocalMateChatInput } }) =>
        publicLocalMateRepository.chat(variables.input),
    }),
  },
});
