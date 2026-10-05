import { HttpClient } from "@/core/http/http-client";
import type {
  CreatePublicOrderInput,
  CreatePublicSessionInput,
  PublicBookingCandidate,
  PublicConversation,
  PublicConversationMessage,
  PublicLocalMateChatInput,
  PublicLocalMateReply,
  PublicLocalMateSession,
  PublicOrder,
  SendPublicMessageInput,
} from "./types";

const getHttp = () =>
  new HttpClient({
    baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  });

export const publicLocalMateRepository = {
  chat: (input: PublicLocalMateChatInput) =>
    getHttp().request<PublicLocalMateReply, PublicLocalMateChatInput>({
      method: "POST",
      path: "/api/localmate/public-chat",
      body: input,
      isPublic: true,
      timeoutMs: 60_000,
    }),

  createSession: (input: CreatePublicSessionInput) =>
    getHttp().request<PublicLocalMateSession, CreatePublicSessionInput>({
      method: "POST",
      path: "/api/localmate/sessions",
      body: input,
      isPublic: true,
    }),

  getCandidate: (candidateKey: string) =>
    getHttp().request<PublicBookingCandidate>({
      method: "GET",
      path: `/api/localmate/candidates/${encodeURIComponent(candidateKey)}`,
      isPublic: true,
    }),

  createOrder: (input: CreatePublicOrderInput) =>
    getHttp().request<PublicOrder, CreatePublicOrderInput>({
      method: "POST",
      path: "/api/localmate/orders",
      body: input,
      isPublic: true,
    }),

  getOrder: (orderId: string) =>
    getHttp().request<PublicOrder>({
      method: "GET",
      path: `/api/localmate/orders/${encodeURIComponent(orderId)}`,
      isPublic: true,
    }),

  createPaymentSession: (orderId: string) =>
    getHttp().request<{ payment: PublicOrder["payment"] }>({
      method: "POST",
      path: `/api/localmate/orders/${encodeURIComponent(orderId)}/payment-session`,
      body: {},
      isPublic: true,
    }),

  getConversation: (orderId: string, query?: { limit?: number; before?: string }) =>
    getHttp().request<PublicConversation>({
      method: "GET",
      path: `/api/localmate/orders/${encodeURIComponent(orderId)}/conversation`,
      query,
      isPublic: true,
    }),

  sendMessage: (orderId: string, input: SendPublicMessageInput) =>
    getHttp().request<PublicConversationMessage, SendPublicMessageInput>({
      method: "POST",
      path: `/api/localmate/orders/${encodeURIComponent(orderId)}/conversation/messages`,
      body: input,
      isPublic: true,
    }),
};
