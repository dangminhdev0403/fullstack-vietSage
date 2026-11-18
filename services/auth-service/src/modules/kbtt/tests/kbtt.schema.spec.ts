import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  kbttPaginationQuerySchema,
  kbttAutoSubmitConfigSchema,
  kbttAutoSubmitRunStatusSchema,
  kbttAutoSubmitRunSummarySchema,
  kbttAutoSubmitTestQuerySchema,
  getKbttSubmissionDateContext,
  validateKbttSubmissionDates,
  normalizeKbttSubmissionDates,
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

describe("validateKbttSubmissionDates (Current Date Policy)", () => {
  const context = getKbttSubmissionDateContext(new Date("2026-09-14T05:00:00.000Z")); // 2026-09-14 12:00 VN

  it("accepts arrival on today (2026-09-14) or yesterday (2026-09-13) and departure >= yesterday", () => {
    expect(
      validateKbttSubmissionDates(
        "VIETNAMESE",
        {
          ngayDenCsltStr: "2026-09-14 10:00:00",
          ngayDiDuKienStr: "2026-09-15 12:00:00",
        },
        context,
      ),
    ).toEqual(expect.objectContaining({ valid: true, outOfWindow: false }));

    expect(
      validateKbttSubmissionDates(
        "VIETNAMESE",
        {
          ngayDenCsltStr: "2026-09-13 15:00:00",
          ngayDiDuKienStr: "2026-09-14 12:00:00",
        },
        context,
      ),
    ).toEqual(expect.objectContaining({ valid: true, outOfWindow: false }));
  });

  it("rejects arrival on D-2 (2026-09-12) or tomorrow (2026-09-15) with outOfWindow=true", () => {
    const dMinus2 = validateKbttSubmissionDates(
      "VIETNAMESE",
      {
        ngayDenCsltStr: "2026-09-12 14:00:00",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
      },
      context,
    );
    expect(dMinus2.valid).toBe(false);
    expect(dMinus2.outOfWindow).toBe(true);
    expect(dMinus2.issues[0]?.field).toBe("ngayDenCsltStr");

    const tomorrow = validateKbttSubmissionDates(
      "VIETNAMESE",
      {
        ngayDenCsltStr: "2026-09-15 08:00:00",
        ngayDiDuKienStr: "2026-09-16 12:00:00",
      },
      context,
    );
    expect(tomorrow.valid).toBe(false);
    expect(tomorrow.outOfWindow).toBe(true);
  });

  it("enforces foreign thoiHanTamTruStr >= today and >= ngayDenCsltStr", () => {
    const yesterdayResidence = validateKbttSubmissionDates(
      "FOREIGN",
      {
        ngayDenCsltStr: "2026-09-13 14:00:00",
        ngayDiDuKienStr: "2026-09-15 12:00:00",
        thoiHanTamTruStr: "2026-09-13 23:59:59",
      },
      context,
    );
    expect(yesterdayResidence.valid).toBe(false);
    expect(yesterdayResidence.outOfWindow).toBe(false);
    expect(yesterdayResidence.issues.map((i) => i.field)).toContain("thoiHanTamTruStr");

    const todayResidence = validateKbttSubmissionDates(
      "FOREIGN",
      {
        ngayDenCsltStr: "2026-09-13 14:00:00",
        ngayDiDuKienStr: "2026-09-14 12:00:00",
        thoiHanTamTruStr: "2026-09-14 00:00:00",
      },
      context,
    );
    expect(todayResidence.valid).toBe(true);
  });
});


describe("normalizeKbttSubmissionDates outbound-only rounding", () => {
  const context = { todayYmd: "2026-11-18", yesterdayYmd: "2026-11-17" };
  it("rounds old dates without mutating frozen local data and preserves valid clock times", () => {
    const payload = Object.freeze({ ngayDenCsltStr: "2026-11-15 14:00:00", ngayDiDuKienStr: "2026-11-16 18:00:00", hoTen: "Guest" });
    const result = normalizeKbttSubmissionDates("VIETNAMESE", payload, context);
    expect(result).toEqual({ ...payload, ngayDenCsltStr: "2026-11-17 14:00:00", ngayDiDuKienStr: "2026-11-17 18:00:00" });
    expect(result).not.toBe(payload);
    expect(payload.ngayDenCsltStr).toBe("2026-11-15 14:00:00");
    expect(validateKbttSubmissionDates("VIETNAMESE", result, context).valid).toBe(true);
  });
  it.each(["2026-11-17 14:00:00", "2026-11-18 14:00:00"])("preserves in-window arrival %s", (arrival) => {
    const payload = { ngayDenCsltStr: arrival, ngayDiDuKienStr: "2026-11-19 12:00:00" };
    expect(normalizeKbttSubmissionDates("VIETNAMESE", payload, context)).toEqual(payload);
  });
  it("raises departure to the full normalized arrival when retaining its time would reverse ordering", () => {
    expect(normalizeKbttSubmissionDates("VIETNAMESE", { ngayDenCsltStr: "2026-11-15 14:00:00", ngayDiDuKienStr: "2026-11-16 12:00:00" }, context)).toEqual({ ngayDenCsltStr: "2026-11-17 14:00:00", ngayDiDuKienStr: "2026-11-17 14:00:00" });
  });
  it("raises foreign residence to today, preserving its time or arrival ordering", () => {
    const payload = { ngayDenCsltStr: "2026-11-18 14:00:00", ngayDiDuKienStr: "2026-11-18 15:00:00", thoiHanTamTruStr: "2026-11-15 12:00:00" };
    const result = normalizeKbttSubmissionDates("FOREIGN", payload, context);
    expect(result.thoiHanTamTruStr).toBe("2026-11-18 14:00:00");
    expect(validateKbttSubmissionDates("FOREIGN", result, context).valid).toBe(true);
    expect(normalizeKbttSubmissionDates("FOREIGN", { ...payload, thoiHanTamTruStr: "2026-11-15 18:00:00" }, context).thoiHanTamTruStr).toBe("2026-11-18 18:00:00");
  });
  it("recomputes Vietnam date across midnight and month boundaries on each attempt", () => {
    const payload = { ngayDenCsltStr: "2026-10-20 14:00:00", ngayDiDuKienStr: "2026-10-20 18:00:00" };
    expect(normalizeKbttSubmissionDates("VIETNAMESE", payload, new Date("2026-10-31T16:59:59Z")).ngayDenCsltStr).toBe("2026-10-30 14:00:00");
    expect(normalizeKbttSubmissionDates("VIETNAMESE", payload, new Date("2026-10-31T17:00:00Z")).ngayDenCsltStr).toBe("2026-10-31 14:00:00");
  });
  it.each([undefined, "", "2026-02-30 14:00:00", "2026-11-15", 123])("leaves malformed or missing arrival invalid: %s", (arrival) => {
    const result = normalizeKbttSubmissionDates("FOREIGN", { ngayDenCsltStr: arrival, ngayDiDuKienStr: "invalid", thoiHanTamTruStr: null }, context);
    expect(result.ngayDenCsltStr).toBe(arrival);
    expect(result.ngayDiDuKienStr).toBe("invalid");
    expect(result.thoiHanTamTruStr).toBeNull();
    expect(validateKbttSubmissionDates("FOREIGN", result, context).valid).toBe(false);
  });
  it("never brings future arrivals into the accepted window", () => {
    const result = normalizeKbttSubmissionDates("VIETNAMESE", { ngayDenCsltStr: "2026-11-19 14:00:00", ngayDiDuKienStr: "2026-11-20 12:00:00" }, context);
    expect(result.ngayDenCsltStr).toBe("2026-11-19 14:00:00");
    expect(validateKbttSubmissionDates("VIETNAMESE", result, context).outOfWindow).toBe(true);
  });
});
