import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  CreateLocalMateGuideInput,
  CreatedLocalMateGuide,
  CreateLocalMateTourInput,
  LocalMateAdminData,
  LocalMateGuide,
  LocalMateStatus,
  LocalMateTourKnowledge,
  MatchAiResponse,
  MatchLocalMateAiInput,
  UpdateLocalMateGuideInput,
  UpdateLocalMateTourInput,
} from "./types";

export const localMateAdminRepository = {
  data: async () =>
    (await requestInternalApiEnvelope<LocalMateAdminData>("/api/admin/localmate", { method: "GET" })).data,

  createGuide: async (input: CreateLocalMateGuideInput) =>
    (
      await requestInternalApiEnvelope<CreatedLocalMateGuide>("/api/admin/localmate", {
        method: "POST",
        body: { action: "createGuide", input },
      })
    ).data,

  updateGuide: async (guideId: string, input: UpdateLocalMateGuideInput) =>
    (
      await requestInternalApiEnvelope<LocalMateGuide>("/api/admin/localmate", {
        method: "POST",
        body: { action: "updateGuide", guideId, input },
      })
    ).data,

  updateQualification: async (guideId: string, status: LocalMateStatus) =>
    (
      await requestInternalApiEnvelope<LocalMateGuide>("/api/admin/localmate", {
        method: "POST",
        body: { action: "updateQualification", guideId, status },
      })
    ).data,

  pairTelegram: async (guideId: string) =>
    (
      await requestInternalApiEnvelope<{
        pairingUrl: string;
        expiresAt: string;
        expiresInSeconds: number;
      }>("/api/admin/localmate", {
        method: "POST",
        body: { action: "pairTelegram", guideId },
      })
    ).data,

  disconnectTelegram: async (guideId: string) =>
    (
      await requestInternalApiEnvelope<{ disconnected: boolean; alreadyDisconnected: boolean }>(
        "/api/admin/localmate",
        {
          method: "POST",
          body: { action: "disconnectTelegram", guideId },
        },
      )
    ).data,

  createTour: async (input: CreateLocalMateTourInput) =>
    (
      await requestInternalApiEnvelope<LocalMateTourKnowledge>("/api/admin/localmate", {
        method: "POST",
        body: { action: "createTour", input },
      })
    ).data,

  updateTour: async (tourId: string, input: UpdateLocalMateTourInput) =>
    (
      await requestInternalApiEnvelope<LocalMateTourKnowledge>("/api/admin/localmate", {
        method: "POST",
        body: { action: "updateTour", tourId, input },
      })
    ).data,

  deleteTour: async (tourId: string) =>
    (
      await requestInternalApiEnvelope<{ success: boolean; message: string }>("/api/admin/localmate", {
        method: "POST",
        body: { action: "deleteTour", tourId },
      })
    ).data,

  matchAi: async (input: MatchLocalMateAiInput) =>
    (
      await requestInternalApiEnvelope<MatchAiResponse>("/api/admin/localmate", {
        method: "POST",
        body: { action: "matchAi", input },
      })
    ).data,
};

