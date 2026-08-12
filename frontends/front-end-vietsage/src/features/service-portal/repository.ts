import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import type { ServiceItemImportPreview, ServicePortalData, ServiceProfile } from "./types";
const call = async <T>(method: string, body?: unknown) => { const response = await fetch("/api/service-portal", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const payload: unknown = await response.json(); if (!response.ok) throw new Error(typeof payload === "object" && payload && "message" in payload ? String((payload as { message: unknown }).message) : "Service portal request failed"); return unwrapApiEnvelope<T>(payload).data; };
const csvCall = async (action: "template" | "export") => { const response = await fetch(`/api/service-portal?file=${action}`, { cache: "no-store" }); if (!response.ok) throw new Error("Không thể tải file CSV"); return response.blob(); };
export const servicePortalRepository = {
  data: () => call<ServicePortalData>("GET"),
  profile: (input: Partial<ServiceProfile>) => call<ServiceProfile>("PATCH", input),
  create: (input: unknown) => call("POST", { action: "create", input }),
  update: (input: { serviceId: string; data: unknown }) => call("POST", { action: "update", ...input }),
  transition: (input: { orderId: string; toStatus: string }) => call("POST", { action: "transition", ...input }),
  importPreview: (input: { csv: string; fileName: string }) => call<ServiceItemImportPreview>("POST", { action: "importPreview", ...input }),
  importCommit: (input: { csv: string; fileName: string; previewToken: string }) => call("POST", { action: "importCommit", ...input }),
  template: () => csvCall("template"),
  export: () => csvCall("export"),
};
