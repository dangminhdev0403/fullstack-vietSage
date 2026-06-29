import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { GuestScanQrRequest } from "@/features/guest-os/types/guest-os-contract";

import {
  getGuestLocaleCode,
  guestHttpErrorResponse,
  guestSuccessResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
  readJsonBody,
} from "../../_utils";

function sanitizeScanPayload(payload: unknown): GuestScanQrRequest | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Record<string, unknown>;
  const qrCode = typeof input.qrCode === "string" ? input.qrCode.trim() : "";
  const deviceFingerprint = typeof input.deviceFingerprint === "string" ? input.deviceFingerprint.trim() : undefined;
  const currentSessionToken =
    typeof input.currentSessionToken === "string" ? input.currentSessionToken.trim() : undefined;
  const forceSwitch = typeof input.forceSwitch === "boolean" ? input.forceSwitch : undefined;

  if (!qrCode) {
    return null;
  }

  return {
    qrCode,
    ...(deviceFingerprint ? { deviceFingerprint } : {}),
    ...(currentSessionToken ? { currentSessionToken } : {}),
    ...(forceSwitch !== undefined ? { forceSwitch } : {}),
  };
}

export async function POST(request: Request) {
  const payload = await readJsonBody(request);
  const input = sanitizeScanPayload(payload);
  const locale = getGuestLocaleCode(request);

  if (!input) {
    return guestValidationErrorResponse("qrCode is required");
  }

  try {
    const data = await guestOsService.scanQr({ ...input, ...(locale ? { locale } : {}) });
    return guestSuccessResponse({ status: 201, error: null, message: "Tạo phiên khách thành công", data }, 201);
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}
