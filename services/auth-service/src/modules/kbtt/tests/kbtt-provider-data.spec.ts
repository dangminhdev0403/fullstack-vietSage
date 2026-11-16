import { providerReadFixtures as fixtures } from "./fixtures/kbtt-provider-read.fixtures";
import {
  kbttAccommodationSchema, kbttCurrentUserSchema, kbttForeignDetailSchema,
  kbttForeignHistoryPageSchema, kbttResidentPageSchema, kbttVietnameseDetailSchema,
  kbttVietnameseHistoryPageSchema, kbttVietnameseLookupSchema,
} from "../domain/schemas/kbtt-provider-data.schema";

describe("observed BCA GET response data contracts", () => {
  it.each([
    ["active residents", kbttResidentPageSchema, fixtures.residentPage],
    ["VN history", kbttVietnameseHistoryPageSchema, fixtures.vietnameseHistoryPage],
    ["foreign history", kbttForeignHistoryPageSchema, fixtures.foreignHistoryPage],
    ["VN detail", kbttVietnameseDetailSchema, fixtures.vietnameseDetail],
    ["foreign detail", kbttForeignDetailSchema, fixtures.foreignDetail],
    ["VN lookup", kbttVietnameseLookupSchema, fixtures.vietnameseLookup],
    ["accommodation", kbttAccommodationSchema, fixtures.accommodation],
    ["current user", kbttCurrentUserSchema, fixtures.currentUser],
  ])("accepts and preserves the observed %s shape", (_name, schema, fixture) => {
    expect(schema.parse(fixture)).toEqual(fixture);
  });

  it("preserves provider additions including nested metadata", () => {
    const response = { ...fixtures.vietnameseDetail, extra: { trace: "synthetic" },
      cslt: { ...fixtures.vietnameseDetail.cslt, extra: false } };
    expect(kbttVietnameseDetailSchema.parse(response)).toEqual(response);
  });

  it("accepts explicit VN lookup null without converting it to an object", () => {
    expect(kbttVietnameseLookupSchema.parse(null)).toBeNull();
    expect(kbttCurrentUserSchema.safeParse(null).success).toBe(false);
  });

  it.each([{}, { totalElements: 0 }, { content: [] },
    { content: null, totalElements: 0 }, { content: [], totalElements: "0" },
    { content: [], totalElements: -1 }, { content: [], totalElements: 0.5 },
  ])("rejects invalid page metadata without manufacturing an empty page: %j", (value) => {
    expect(kbttResidentPageSchema.safeParse(value).success).toBe(false);
  });

  it("rejects wrong/missing guest identity and never coerces numeric identifiers", () => {
    for (const schema of [kbttVietnameseDetailSchema, kbttForeignDetailSchema]) {
      expect(schema.safeParse({ ...fixtures.vietnameseDetail, id: 123 }).success).toBe(false);
      expect(schema.safeParse({ id: "synthetic-record-id" }).success).toBe(false);
    }
    expect(kbttVietnameseHistoryPageSchema.safeParse({ content: [{}], totalElements: 1 }).success).toBe(false);
    expect(kbttForeignHistoryPageSchema.safeParse({ content: [{ id: 1, hoTen: "synthetic" }], totalElements: 1 }).success).toBe(false);
  });

  it("leaves unobserved active resident items untouched rather than borrowing history", () => {
    const response = { content: [{ providerFutureField: true }], totalElements: 1 };
    expect(kbttResidentPageSchema.parse(response)).toEqual(response);
  });

  it("preserves null-only fields and unobserved nested items without invented types", () => {
    const response = { ...fixtures.foreignDetail, ngayXml: { futureShape: true }, treEm: [{ unknownChild: 1 }] };
    expect(kbttForeignDetailSchema.parse(response)).toEqual(response);
    const user = { ...fixtures.currentUser, menus: [{ futureMenu: 1 }], permissions: ["futurePermission"] };
    expect(kbttCurrentUserSchema.parse(user)).toEqual(user);
  });

  it("validates observed optional fields instead of silently dropping malformed values", () => {
    expect(kbttVietnameseDetailSchema.safeParse({ ...fixtures.vietnameseDetail, soGiayTo: 123 }).success).toBe(false);
    expect(kbttAccommodationSchema.safeParse({ ...fixtures.accommodation, choPhepSuaTatCa: "true" }).success).toBe(false);
    expect(kbttForeignDetailSchema.safeParse({ ...fixtures.foreignDetail, quaHan: "false" }).success).toBe(false);
  });
  it("preserves nullable optional VN fields observed on another history record", () => {
    const page = { ...fixtures.vietnameseHistoryPage, content: [
      ...fixtures.vietnameseHistoryPage.content,
      { ...fixtures.vietnameseHistoryPage.content[0], lyDoChiTiet: null, tenGiayToKhac: null },
    ], totalElements: 2 };
    expect(kbttVietnameseHistoryPageSchema.parse(page)).toEqual(page);
  });

});
