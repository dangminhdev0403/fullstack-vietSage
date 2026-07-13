export type ApiEnvelope<TData> = {
  status: number;
  error: unknown;
  message: string;
  data: TData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function unwrapApiEnvelope<TData>(payload: unknown): ApiEnvelope<TData> {
  if (!isRecord(payload)) {
    throw new Error("Invalid API response envelope: expected object");
  }

  if (typeof payload.status !== "number") {
    throw new Error("Invalid API response envelope: missing numeric status");
  }

  if (typeof payload.message !== "string") {
    throw new Error("Invalid API response envelope: missing message");
  }

  if (!("data" in payload)) {
    throw new Error("Invalid API response envelope: missing data field");
  }

  return payload as ApiEnvelope<TData>;
}

export function toApiErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return "Request failed";
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  return "Request failed";
}
