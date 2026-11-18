import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  kbttPaginationQuerySchema,
  kbttAutoSubmitConfigSchema,
  kbttAutoSubmitRunStatusSchema,
  kbttAutoSubmitRunSummarySchema,
  kbttAutoSubmitTestQuerySchema,
} from "../domain/schemas/kbtt.schema";

describe("KBTT Auto-Submit Schemas", () => {
  describe("kbttAutoSubmitConfigSchema", () => {
    it("should reject custom HH:mm time because daily slots are fixed at 12:00 and 21:00", () => {
      const customTime = {
        autoSubmitEnabled: true,
        autoSubmitTime: "04:30",
      };
      const res = kbttAutoSubmitConfigSchema.safeParse(customTime);
      expect(res.success).toBe(false);
    });

    it("should reject omitted autoSubmitEnabled even when autoSubmitTime is null", () => {
      expect(kbttAutoSubmitConfigSchema.safeParse({ autoSubmitTime: null }).success).toBe(false);
      expect(kbttAutoSubmitConfigSchema.safeParse({}).success).toBe(false);
    });

    it("BCA-07: aligns OpenAPI PUT /hotels/{hotelId}/kbtt/auto-submit schema with runtime kbttAutoSubmitConfigSchema", () => {
      const openapiPath = resolve(
        __dirname,
        "../../../../../../shared/api-contract/openapi/v1/openapi.json",
      );
      const spec = JSON.parse(readFileSync(openapiPath, "utf8"));
      const putSchema =
        spec.paths?.["/hotels/{hotelId}/kbtt/auto-submit"]?.put?.requestBody?.content?.[
          "application/json"
        ]?.schema;
      expect(putSchema).toBeDefined();
      expect(putSchema.required).toEqual(["autoSubmitEnabled"]);
      expect(putSchema.additionalProperties).toBe(false);
      expect(putSchema.anyOf).toBeUndefined();
      expect(putSchema.properties?.autoSubmitTime?.enum).toEqual([null]);
      expect(putSchema.properties?.autoSubmitTime?.pattern).toBeUndefined();
    });

    it("should accept enabled/disabled config without time", () => {
      expect(kbttAutoSubmitConfigSchema.safeParse({ autoSubmitEnabled: true }).success).toBe(true);
      expect(kbttAutoSubmitConfigSchema.safeParse({ autoSubmitEnabled: false }).success).toBe(true);
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

describe("KBTT current-page stay scope", () => {
  it("parses bounded CSV IDs without accepting empty or excessive scope", () => {
    expect(kbttPaginationQuerySchema.parse({ stayIds: "stay-1, stay-2" }).stayIds).toEqual(["stay-1", "stay-2"]);
    for (const stayIds of ["", "stay-1,", Array.from({ length: 21 }, (_, i) => `stay-${i}`).join(","), "x".repeat(129)]) {
      expect(kbttPaginationQuerySchema.safeParse({ stayIds }).success).toBe(false);
    }
  });
});
