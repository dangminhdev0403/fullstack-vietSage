import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import type {
  CreateLocalMateGuideInput,
  CreatedLocalMateGuide,
  CreateLocalMateTourInput,
  LocalMateGuide,
  LocalMateStatus,
  LocalMateTourKnowledge,
  MatchAiResponse,
  MatchLocalMateAiInput,
  UpdateLocalMateGuideInput,
  UpdateLocalMateTourInput,
} from "./types";

const http = new HttpClient({ baseUrl: getBackendApiBaseUrl() });

const call = async <T, B = unknown>(
  token: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: B,
) => unwrapApiEnvelope<T>(await http.request<unknown, B>({ method, path, accessToken: token, body })).data;

export const localMateAdminClient = {
  listGuides: (token: string, status?: LocalMateStatus) =>
    call<{ items: LocalMateGuide[]; total: number }>(
      token,
      "GET",
      status ? `/localmate-admin/guides?status=${status}` : "/localmate-admin/guides",
    ),

  getGuide: (token: string, guideId: string) =>
    call<LocalMateGuide>(token, "GET", `/localmate-admin/guides/${guideId}`),

  createGuide: (token: string, dto: CreateLocalMateGuideInput) =>
    call<CreatedLocalMateGuide, CreateLocalMateGuideInput>(
      token,
      "POST",
      "/localmate-admin/guides",
      dto,
    ),

  updateGuide: (token: string, guideId: string, dto: UpdateLocalMateGuideInput) =>
    call<LocalMateGuide, UpdateLocalMateGuideInput>(
      token,
      "PATCH",
      `/localmate-admin/guides/${guideId}`,
      dto,
    ),

  updateQualification: (token: string, guideId: string, status: LocalMateStatus) =>
    call<LocalMateGuide, { status: LocalMateStatus }>(
      token,
      "PATCH",
      `/localmate-admin/guides/${guideId}/qualification`,
      { status },
    ),

  createTour: (token: string, dto: CreateLocalMateTourInput) =>
    call<LocalMateTourKnowledge, CreateLocalMateTourInput>(
      token,
      "POST",
      "/localmate-admin/knowledge/tours",
      dto,
    ),

  updateTour: (token: string, tourId: string, dto: UpdateLocalMateTourInput) =>
    call<LocalMateTourKnowledge, UpdateLocalMateTourInput>(
      token,
      "PATCH",
      `/localmate-admin/knowledge/tours/${tourId}`,
      dto,
    ),

  deleteTour: (token: string, tourId: string) =>
    call<{ success: boolean; message: string }>(
      token,
      "DELETE",
      `/localmate-admin/knowledge/tours/${tourId}`,
    ),

  listTours: (token: string, destination?: string) =>
    call<LocalMateTourKnowledge[]>(
      token,
      "GET",
      destination
        ? `/localmate-admin/knowledge/tours?destination=${encodeURIComponent(destination)}`
        : "/localmate-admin/knowledge/tours",
    ),

  matchAi: (token: string, dto: MatchLocalMateAiInput) =>
    call<MatchAiResponse, MatchLocalMateAiInput>(
      token,
      "POST",
      "/localmate/ai/match",
      dto,
    ),
};
