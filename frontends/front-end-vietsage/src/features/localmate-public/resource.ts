import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { publicLocalMateRepository } from "./repository";
import type {
  CreatePublicOrderInput,
  CreatePublicSessionInput,
  PublicLocalMateChatInput,
  SendPublicMessageInput,
} from "./types";

export const publicLocalMateResource = createResource<Record<string, never>>()({
  namespace: ["vietsage"],
  name: "localmate-public",
  scopeKey: () => [],
  queries: {
    candidate: defineQuery({
      inputKey: (input: { candidateKey: string }) => [input.candidateKey],
      queryFn: ({ input }: { input: { candidateKey: string } }) =>
        publicLocalMateRepository.getCandidate(input.candidateKey),
    }),
    order: defineQuery({
      inputKey: (input: { orderId: string }) => [input.orderId],
      queryFn: ({ input }: { input: { orderId: string } }) =>
        publicLocalMateRepository.getOrder(input.orderId),
    }),
    conversation: defineQuery({
      inputKey: (input: { orderId: string; query?: { limit?: number; before?: string } }) => [
        input.orderId,
        input.query?.limit ?? null,
        input.query?.before ?? null,
      ],
      queryFn: ({
        input,
      }: {
        input: { orderId: string; query?: { limit?: number; before?: string } };
      }) => publicLocalMateRepository.getConversation(input.orderId, input.query),
    }),
  },
  mutations: {
    chat: defineMutation({
      mutationFn: ({ variables }: { variables: { input: PublicLocalMateChatInput } }) =>
        publicLocalMateRepository.chat(variables.input),
    }),
    createSession: defineMutation({
      mutationFn: ({ variables }: { variables: { input: CreatePublicSessionInput } }) =>
        publicLocalMateRepository.createSession(variables.input),
    }),
    createOrder: defineMutation({
      mutationFn: ({ variables }: { variables: { input: CreatePublicOrderInput } }) =>
        publicLocalMateRepository.createOrder(variables.input),
    }),
    createPaymentSession: defineMutation({
      mutationFn: ({ variables }: { variables: { orderId: string } }) =>
        publicLocalMateRepository.createPaymentSession(variables.orderId),
    }),
    sendMessage: defineMutation({
      mutationFn: ({
        variables,
      }: {
        variables: { orderId: string; input: SendPublicMessageInput };
      }) => publicLocalMateRepository.sendMessage(variables.orderId, variables.input),
    }),
  },
});
