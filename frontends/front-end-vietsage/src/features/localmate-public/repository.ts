import { HttpClient } from "@/core/http/http-client";
import type { PublicLocalMateChatInput, PublicLocalMateReply } from "./types";

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
      timeoutMs: 45_000,
    }),
};
