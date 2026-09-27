import { z } from "zod";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import type { GuestChatAction } from "@/features/marketplace/types/marketplace-contract";

export const rawCandidateActionSchema = z.object({
  type: z.literal("LOCALMATE_BOOKING"),
  candidateKey: z.string().trim().min(1).max(80),
});

export type RawCandidateAction = z.infer<typeof rawCandidateActionSchema>;

export async function resolveChatAction(
  rawAction: unknown,
  hotelId: string,
  options?: { backendBaseUrl?: string; knowledgeApiKey?: string },
): Promise<GuestChatAction | null> {
  const parsed = rawCandidateActionSchema.safeParse(rawAction);
  if (!parsed.success) {
    return null;
  }

  const { candidateKey } = parsed.data;
  const baseUrl = (options?.backendBaseUrl ?? getBackendApiBaseUrl()).replace(/\/$/, "");
  const knowledgeApiKey =
    options?.knowledgeApiKey ??
    process.env.LOCALMATE_KNOWLEDGE_API_KEY ??
    process.env.VIETSAGE_KNOWLEDGE_API_KEY ??
    "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const url = `${baseUrl}/localmate/booking-candidate/${encodeURIComponent(candidateKey)}?hotelId=${encodeURIComponent(hotelId)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (knowledgeApiKey) {
      headers["X-VietSage-Knowledge-Key"] = knowledgeApiKey;
    }

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return null;
    }

    type CandidateData = {
      candidateKey?: string;
      guide?: {
        fullName?: string;
        avatarUrl?: string;
        languages?: string[];
        specialties?: string[];
        rating?: number;
        totalReviews?: number;
      };
      service?: {
        id: string;
        name: string;
        price?: number | string;
        unitPrice?: number | string;
        currency?: string;
        unit?: string | null;
        pricingUnit?: string | null;
      };
      hotel?: {
        id: string;
        name: string;
        province?: string;
      };
      telegramReady?: boolean;
    };

    const payload = (await res.json()) as {
      status?: number;
      data?: CandidateData;
    } & CandidateData;

    const data: CandidateData = payload?.data ?? payload;
    if (!data?.guide || !data?.service?.id) {
      return null;
    }

    const resolved: GuestChatAction = {
      type: "LOCALMATE_BOOKING",
      candidateKey: data.candidateKey ?? candidateKey,
      localMate: {
        fullName: data.guide.fullName ?? "",
        avatarUrl: data.guide.avatarUrl ?? "",
        languages: Array.isArray(data.guide.languages) ? data.guide.languages : [],
        specialties: Array.isArray(data.guide.specialties) ? data.guide.specialties : [],
        rating: Number(data.guide.rating) || 5,
        totalReviews: Number(data.guide.totalReviews) || 0,
        telegramReady: Boolean(data.telegramReady),
      },
      service: {
        id: data.service.id,
        name: data.service.name,
        unitPrice: String(data.service.price ?? data.service.unitPrice ?? "0"),
        currency: data.service.currency ?? "VND",
        pricingUnit: data.service.unit ?? data.service.pricingUnit ?? null,
      },
    };

    return resolved;
  } catch {
    return null;
  }
}
