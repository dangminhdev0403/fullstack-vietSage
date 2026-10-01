import { NextResponse } from "next/server";

const AUTH_API_BASE_URL =
  process.env.AUTH_API_BASE_URL?.trim() || "http://localhost:8080";

export async function GET() {
  return NextResponse.json({
    status: "OK",
    service: "VietSage Channex Webhook Endpoint",
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    const secret = request.headers.get("x-channex-webhook-secret");
    if (secret) {
      headers.set("x-channex-webhook-secret", secret);
    }

    const backendUrl = `${AUTH_API_BASE_URL}/api/v1/channel-manager/channex/webhook`;
    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: rawBody,
    });

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to forward Channex webhook", details: String(error) },
      { status: 502 },
    );
  }
}
