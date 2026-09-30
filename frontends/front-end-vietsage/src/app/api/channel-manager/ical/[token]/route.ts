import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) return new Response("Not found", { status: 404 });

  const response = await fetch(
    `${getBackendApiBaseUrl()}/api/v1/channel-manager/ical/${encodeURIComponent(token)}`,
    { method: "GET", cache: "no-store" },
  );
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
