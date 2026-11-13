import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient, type HttpMethod } from "@/core/http/http-client";

const client = new HttpClient({ baseUrl: getBackendApiBaseUrl() });

export async function requestHotelExpensesBackend(
  hotelId: string,
  accessToken: string,
  options: {
    method: HttpMethod;
    suffix?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<unknown> {
  const response = await client.request({
    method: options.method,
    path: `/hotels/${encodeURIComponent(hotelId)}/expenses${options.suffix ?? ""}`,
    query: options.query,
    body: options.body,
    accessToken,
  });

  return unwrapApiEnvelope(response).data;
}
