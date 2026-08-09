import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import type { ServicePortalData, ServiceProfile } from "./types";
const call = async <T>(method: string, body?: unknown) => { const response = await fetch("/api/service-portal", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const payload: unknown = await response.json(); if (!response.ok) throw new Error("Service portal request failed"); return unwrapApiEnvelope<T>(payload).data; };
export const servicePortalRepository = {
  data: () => call<ServicePortalData>("GET"),
  profile: (input: Partial<ServiceProfile>) => call<ServiceProfile>("PATCH", input),
  create: (input: unknown) => call("POST", { action: "create", input }),
  transition: (input: { orderId: string; toStatus: string }) => call("POST", { action: "transition", ...input }),
};
