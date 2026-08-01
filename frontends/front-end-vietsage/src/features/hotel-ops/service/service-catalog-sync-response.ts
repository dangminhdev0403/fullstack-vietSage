export type ServiceCatalogSyncResult = {
  inserted: number;
  updated: number;
  disabled: number;
  unchanged: number;
  skipped: number;
  skippedRows: number;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseServiceCatalogSyncResponse(
  payload: unknown,
): ServiceCatalogSyncResult {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("Invalid service catalog sync response");
  }
  const data = payload.data;
  if (
    typeof data.inserted !== "number" ||
    typeof data.updated !== "number" ||
    typeof data.disabled !== "number" ||
    typeof data.unchanged !== "number" ||
    typeof data.skipped !== "number" ||
    typeof data.skippedRows !== "number" ||
    !Array.isArray(data.warnings) ||
    !data.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error("Invalid service catalog sync response");
  }
  return data as ServiceCatalogSyncResult;
}
