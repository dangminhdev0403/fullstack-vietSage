"use client";

import { useState } from "react";

import { logFrontendError, toUserFacingError } from "@/core/errors/error-mapper";
import { translate } from "@/core/i18n/translations";
import { defaultGuestLocale, normalizeGuestLocale } from "@/features/guest-os/i18n/config";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore } from "@/features/guest-os/store/guest-store";
import type { GuestEmergencyCallResult } from "@/features/guest-os/types/guest-os-contract";

export function GuestEmergencyCallCard() {
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const room = useGuestStore((state) => state.room);
  const language = useGuestStore((state) => state.language);
  const locale = normalizeGuestLocale(language ?? defaultGuestLocale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<GuestEmergencyCallResult | null>(null);
  const [error, setError] = useState<ReturnType<typeof toUserFacingError> | null>(null);

  async function handleEmergencyCall() {
    if (!sessionToken || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const data = await guestOsService.createEmergencyCall(
        sessionToken,
        {
          dialedNumber: "112",
          location: {
            source: "QR",
            confidence: room?.roomNumber ? "HIGH" : "LOW",
          },
          metadata: {
            roomNumber: room?.roomNumber,
            roomFloor: room?.floor,
            frontendSource: "guest-home-emergency-card",
          },
        },
        locale,
      );
      setResult(data);
    } catch (caughtError) {
      const userError = toUserFacingError(caughtError);
      logFrontendError("GUEST_EMERGENCY_CALL_FAILED", caughtError, userError);
      setError(userError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="relative z-10 mx-auto mb-8 w-full max-w-2xl px-4">
      <div className="overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-orange-50 p-5 shadow-[0_18px_50px_rgba(127,29,29,0.14)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-700">
              {translate("guest.emergency.eyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-black text-red-950">{translate("guest.emergency.title")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-red-900/75">
              {translate("guest.emergency.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleEmergencyCall}
            disabled={!sessionToken || isSubmitting}
            className="min-h-14 rounded-xl bg-red-700 px-6 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-red-900/20 transition hover:-translate-y-0.5 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? translate("guest.emergency.submitting") : translate("guest.emergency.submit")}
          </button>
        </div>

        {result ? (
          <div className="mt-4 rounded-xl bg-white/80 p-4 text-sm text-red-950 ring-1 ring-red-100">
            {translate("guest.emergency.success", {
              callId: result.callEvent.id.slice(-6),
              incidentId: result.incident.id.slice(-6),
              severity: result.incident.severity,
            })}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 space-y-3 rounded-xl bg-red-100 p-4 text-sm font-semibold text-red-900">
            <p>{error.message}</p>
            <div className="flex flex-wrap gap-2">
              {error.canRetry ? (
                <button
                  type="button"
                  onClick={handleEmergencyCall}
                  className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black uppercase tracking-wide text-white"
                >
                  {translate("guest.emergency.retry")}
                </button>
              ) : null}
              {error.shouldContactHotel ? (
                <a
                  href="tel:0"
                  className="rounded-lg bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-red-800 ring-1 ring-red-200"
                >
                  {translate("guest.emergency.contactHotel")}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
