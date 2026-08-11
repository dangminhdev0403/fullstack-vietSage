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

describe("Guest Request Full Lifecycle TDD (CREATED -> ACKNOWLEDGED -> IN_PROGRESS -> COMPLETED)", () => {
  describe("1. Domain Normalization & Compatibility", () => {
    it("preserves ACKNOWLEDGED and IN_PROGRESS as distinct canonical statuses", () => {
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.CREATED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.ACKNOWLEDGED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.IN_PROGRESS);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.COMPLETED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.CANCELLED);
      expect(canonicalGuestRequestStatuses).toContain(GuestRequestStatus.FAILED);
    });

    it("normalizes legacy statuses into exact canonical lifecycle stages", () => {
      expect(normalizeGuestRequestStatus(GuestRequestStatus.CREATED)).toBe(
        GuestRequestStatus.CREATED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.NEW)).toBe(GuestRequestStatus.CREATED);

      expect(normalizeGuestRequestStatus(GuestRequestStatus.ACKNOWLEDGED)).toBe(
        GuestRequestStatus.ACKNOWLEDGED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.ACCEPTED)).toBe(
        GuestRequestStatus.ACKNOWLEDGED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.CONFIRMED)).toBe(
        GuestRequestStatus.ACKNOWLEDGED,
      );

      expect(normalizeGuestRequestStatus(GuestRequestStatus.IN_PROGRESS)).toBe(
        GuestRequestStatus.IN_PROGRESS,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.PENDING)).toBe(
        GuestRequestStatus.IN_PROGRESS,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.ON_THE_WAY)).toBe(
        GuestRequestStatus.IN_PROGRESS,
      );

      expect(normalizeGuestRequestStatus(GuestRequestStatus.COMPLETED)).toBe(
        GuestRequestStatus.COMPLETED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.CANCELLED)).toBe(
        GuestRequestStatus.CANCELLED,
      );
      expect(normalizeGuestRequestStatus(GuestRequestStatus.FAILED)).toBe(
        GuestRequestStatus.FAILED,
      );
    });

    it("returns specific compatible DB statuses for query filtering", () => {
      const ackCompatible = compatibleGuestRequestStatuses(GuestRequestStatus.ACKNOWLEDGED);
      expect(ackCompatible).toContain(GuestRequestStatus.ACKNOWLEDGED);
      expect(ackCompatible).toContain(GuestRequestStatus.ACCEPTED);
      expect(ackCompatible).toContain(GuestRequestStatus.CONFIRMED);

      const inProgressCompatible = compatibleGuestRequestStatuses(GuestRequestStatus.IN_PROGRESS);
      expect(inProgressCompatible).toContain(GuestRequestStatus.IN_PROGRESS);
      expect(inProgressCompatible).toContain(GuestRequestStatus.PENDING);
      expect(inProgressCompatible).toContain(GuestRequestStatus.ON_THE_WAY);
    });
  });

  describe("2. Zod Schema Verification", () => {
    it("includes ACKNOWLEDGED and IN_PROGRESS in guest-os schema values", () => {
      expect(guestRequestStatusValues).toContain("CREATED");
      expect(guestRequestStatusValues).toContain("ACKNOWLEDGED");
      expect(guestRequestStatusValues).toContain("IN_PROGRESS");
      expect(guestRequestStatusValues).toContain("COMPLETED");
      expect(guestRequestStatusValues).toContain("CANCELLED");
      expect(guestRequestStatusValues).toContain("FAILED");
    });
  });

  describe("3. Frontend Display Mapping", () => {
    const t = (key: string) => key;

    it("maps each status to its distinct translation key", () => {
      expect(getRequestStatusLabel("CREATED" as any, t)).toBe("requests.sent");
      expect(getRequestStatusLabel("ACKNOWLEDGED" as any, t)).toBe("requests.acknowledged");
      expect(getRequestStatusLabel("IN_PROGRESS" as any, t)).toBe("requests.inProgress");
      expect(getRequestStatusLabel("COMPLETED" as any, t)).toBe("requests.completed");
    });

    it("returns distinct progress steps across full lifecycle", () => {
      expect(getProgressStep("CREATED" as any)).toBe(1);
      expect(getProgressStep("ACKNOWLEDGED" as any)).toBe(2);
      expect(getProgressStep("IN_PROGRESS" as any)).toBe(3);
      expect(getProgressStep("COMPLETED" as any)).toBe(4);
    });
  });
});
