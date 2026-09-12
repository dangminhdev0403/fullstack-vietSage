import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { kbttConnectionSchema, type KbttCredentials } from "../types/kbtt-contract";

function connectionPath(hotelId: string) {
  return `/api/owner/hotels/${encodeURIComponent(hotelId)}/kbtt/connection`;
}

export const kbttRepository = {
  async connection(hotelId: string, signal?: AbortSignal) {
    const payload = await requestInternalApiEnvelope<unknown>(connectionPath(hotelId), { method: "GET", signal });
    return kbttConnectionSchema.parse(payload.data);
  },
  async connect(hotelId: string, credentials: KbttCredentials) {
    try {
      const payload = await requestInternalApiEnvelope<unknown>(connectionPath(hotelId), { method: "PUT", body: credentials });
      return kbttConnectionSchema.parse(payload.data);
    } finally {
      credentials.password = "";
    }
  },
  async check(hotelId: string) {
    const payload = await requestInternalApiEnvelope<unknown>(`${connectionPath(hotelId)}/check`, { method: "POST" });
    return kbttConnectionSchema.parse(payload.data);
  },
  async disconnect(hotelId: string) {
    const payload = await requestInternalApiEnvelope<unknown>(connectionPath(hotelId), { method: "DELETE" });
    return kbttConnectionSchema.parse(payload.data);
  },
};
