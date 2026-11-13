import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient, type HttpMethod } from "@/core/http/http-client";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";

const client = new HttpClient({ baseUrl: getBackendApiBaseUrl() });
export async function requestRevenueBookBackend(hotelId: string, accessToken: string, options: {
  method: HttpMethod;
  suffix?: string;
  query?: { from?: string; to?: string };
  body?: unknown;
}): Promise<unknown> {
  const response = await client.request({
    method: options.method,
    path: `/hotels/${encodeURIComponent(hotelId)}/reports/revenue-book${options.suffix ?? ""}`,
    query: options.query,
    body: options.body,
    accessToken,
  });
  return unwrapApiEnvelope(response).data;
}
