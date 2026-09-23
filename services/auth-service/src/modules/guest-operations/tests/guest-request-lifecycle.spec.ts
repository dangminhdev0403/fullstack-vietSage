import { GuestRequestStatus } from "@prisma/client";
import {
  activeGuestRequestStatuses,
  canonicalGuestRequestStatuses,
  compatibleGuestRequestStatuses,
  normalizeGuestRequestStatus,
} from "../domain/guest-request-status";
import { guestRequestStatusValues } from "../domain/schemas/guest-os.schema";
import {
  getProgressStep,
  getRequestStatusLabel,
} from "../../../../../../frontends/front-end-vietsage/src/features/guest-os/components/requests/guest-request-display";

describe("Guest Request Full Lifecycle TDD (PENDING -> ACKNOWLEDGED -> COMPLETED / CANCELLED / REJECTED)", () => {
  describe("1. Domain Normalization & Compatibility", () => {
    it("preserves canonical statuses", () => {
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.PENDING);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.ACKNOWLEDGED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.COMPLETED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.CANCELLED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.REJECTED);
    });

    it("normalizes statuses directly", () => {
      expect(normalizeGuestRequestStatus(GuestRequestStatus.PENDING)).toBe(
        GuestRequestStatus.PENDING,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.ACKNOWLEDGED)).toBe(
        GuestRequestStatus.ACKNOWLEDGED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.COMPLETED)).toBe(
        GuestRequestStatus.COMPLETED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.CANCELLED)).toBe(
        GuestRequestStatus.CANCELLED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.REJECTED)).toBe(
        GuestRequestStatus.REJECTED,
      );
    });

    it("returns specific compatible DB statuses for query filtering", () => {
      const ackCompatible = compatibleGuestRequestStatuses(GuestRequestStatus.ACKNOWLEDGED);
      expect(ackCompatible).toContain(GuestRequestStatus.ACKNOWLEDGED);
    });
  });

  describe("2. Zod Schema Verification", () => {
    it("includes simplified values in guest-os schema values", () => {
      expect(guestRequestStatusValues).toContain("PENDING");
      expect(guestRequestStatusValues).toContain("ACKNOWLEDGED");
      expect(guestRequestStatusValues).toContain("COMPLETED");
      expect(guestRequestStatusValues).toContain("CANCELLED");
      expect(guestRequestStatusValues).toContain("REJECTED");
    });
  });

  describe("3. Frontend Display Mapping", () => {
    const t = (key: string) => key;

    it("maps each status to its distinct translation key", () => {
      expect(getRequestStatusLabel("PENDING" as any, t)).toBe("requests.sent");
      expect(getRequestStatusLabel("ACKNOWLEDGED" as any, t)).toBe("requests.acknowledged");
      expect(getRequestStatusLabel("COMPLETED" as any, t)).toBe("requests.completed");
      expect(getRequestStatusLabel("CANCELLED" as any, t)).toBe("requests.cancelled");
      expect(getRequestStatusLabel("REJECTED" as any, t)).toBe("requests.rejected");
    });

    it("returns distinct progress steps across full lifecycle", () => {
      expect(getProgressStep("PENDING" as any)).toBe(1);
      expect(getProgressStep("ACKNOWLEDGED" as any)).toBe(2);
      expect(getProgressStep("COMPLETED" as any)).toBe(3);
    });
  });
});
