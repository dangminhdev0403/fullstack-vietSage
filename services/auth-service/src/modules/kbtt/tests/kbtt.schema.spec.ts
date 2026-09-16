import {
  kbttAutoSubmitConfigSchema,
  kbttAutoSubmitRunStatusSchema,
  kbttAutoSubmitRunSummarySchema,
  kbttAutoSubmitTestQuerySchema,
} from "../domain/schemas/kbtt.schema";

describe("KBTT Auto-Submit Schemas", () => {
  describe("kbttAutoSubmitConfigSchema", () => {
    it("should accept valid config with HH:mm", () => {
      const valid = {
        autoSubmitEnabled: true,
        autoSubmitTime: "04:30",
      };
      const res = kbttAutoSubmitConfigSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("should accept disabled config without time", () => {
      const valid = {
        autoSubmitEnabled: false,
      };
      const res = kbttAutoSubmitConfigSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("should accept null time", () => {
      const valid = {
        autoSubmitEnabled: false,
        autoSubmitTime: null,
      };
      const res = kbttAutoSubmitConfigSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("should reject invalid time format", () => {
      const invalid = {
        autoSubmitEnabled: true,
        autoSubmitTime: "25:00",
      };
      const res = kbttAutoSubmitConfigSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it("should reject non-time strings", () => {
      const invalid = {
        autoSubmitEnabled: true,
        autoSubmitTime: "abc",
      };
      const res = kbttAutoSubmitConfigSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe("kbttAutoSubmitRunStatusSchema", () => {
    it("should allow standard statuses", () => {
      expect(kbttAutoSubmitRunStatusSchema.safeParse("RUNNING").success).toBe(true);
      expect(kbttAutoSubmitRunStatusSchema.safeParse("COMPLETED").success).toBe(true);
      expect(kbttAutoSubmitRunStatusSchema.safeParse("FAILED").success).toBe(true);
      expect(kbttAutoSubmitRunStatusSchema.safeParse("CANCELLED").success).toBe(true);
      expect(kbttAutoSubmitRunStatusSchema.safeParse("SKIPPED").success).toBe(true);
      expect(kbttAutoSubmitRunStatusSchema.safeParse("INVALID").success).toBe(false);
    });
  });

  describe("kbttAutoSubmitRunSummarySchema", () => {
    it("should validate a complete run summary", () => {
      const summary = {
        id: "run-1",
        hotelId: "hotel-1",
        scheduledFor: "2026-09-15 04:30:00",
        startedAt: "2026-09-15 04:30:01",
        finishedAt: "2026-09-15 04:30:05",
        status: "COMPLETED",
        totalEligible: 5,
        successCount: 4,
        failureCount: 1,
        unknownCount: 0,
        errorMessage: null,
      };
      const res = kbttAutoSubmitRunSummarySchema.safeParse(summary);
      expect(res.success).toBe(true);
    });
  });

  describe("kbttAutoSubmitTestQuerySchema", () => {
    it("should default dryRun to true if undefined", () => {
      const parsed = kbttAutoSubmitTestQuerySchema.parse({});
      expect(parsed.dryRun).toBe(true);
    });

    it("should allow explicit live mode only through the named mode", () => {
      expect(kbttAutoSubmitTestQuerySchema.parse({ mode: "live" }).dryRun).toBe(false);
      expect(kbttAutoSubmitTestQuerySchema.parse({ mode: "dry-run" }).dryRun).toBe(true);
      expect(kbttAutoSubmitTestQuerySchema.safeParse({ dryRun: false }).success).toBe(false);
      expect(kbttAutoSubmitTestQuerySchema.safeParse({ dryRun: "false" }).success).toBe(false);
    });
  });
});
