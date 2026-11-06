import {
  kbttDomesticDepartureChangeSchema,
  kbttForeignDepartureChangeSchema,
} from "../domain/schemas/kbtt-departure.schema";
import { KbttProviderClient } from "../infrastructure/kbtt-provider.client";

jest.mock("../infrastructure/kbtt.config", () => ({
  loadKbttConfig: () => ({ KBTT_BASE_URL: "https://bca.invalid" }),
  kbttUnavailable: () => new Error("unavailable"),
}));

const domesticCheckout = { loai: "TS", soGiayTo: "001122334455", loaiGiayTo: 1 };
const foreignExtension = {
  loai: "GH",
  soHc: "A1234567",
  quocTich: "RUS",
  thoiGianStr: "2026-11-10 14:00:00",
};

describe("BCA departure wire schemas", () => {
  it("accepts TS without a departure date", () => {
    expect(kbttDomesticDepartureChangeSchema.safeParse(domesticCheckout).success).toBe(true);
    expect(kbttForeignDepartureChangeSchema.safeParse({
      loai: "TS", soHc: "A1234567", quocTich: "RUS",
    }).success).toBe(true);
  });

  it("requires a date for GH in both contracts", () => {
    expect(kbttDomesticDepartureChangeSchema.safeParse({
      ...domesticCheckout, loai: "GH",
    }).success).toBe(false);
    expect(kbttForeignDepartureChangeSchema.safeParse({
      loai: "GH", soHc: "A1234567", quocTich: "RUS",
    }).success).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(kbttForeignDepartureChangeSchema.safeParse({
      ...foreignExtension, thoiGianStr: "2026-02-30 14:00:00",
    }).success).toBe(false);
  });

  it("enforces the documented domestic document-number rules", () => {
    expect(kbttDomesticDepartureChangeSchema.safeParse({
      ...domesticCheckout, soGiayTo: "123456789",
    }).success).toBe(false);
    expect(kbttDomesticDepartureChangeSchema.safeParse({
      ...domesticCheckout, soGiayTo: "123456789", loaiGiayTo: 2,
    }).success).toBe(true);
    expect(kbttDomesticDepartureChangeSchema.safeParse({
      ...domesticCheckout, soGiayTo: "A1234567890", loaiGiayTo: 4,
    }).success).toBe(false);
  });

  it("keeps foreign and domestic identity fields separate", () => {
    expect(kbttForeignDepartureChangeSchema.safeParse({
      ...foreignExtension, soHoChieu: "A1234567",
    }).success).toBe(false);
    expect(kbttDomesticDepartureChangeSchema.safeParse({
      ...domesticCheckout, soHc: "A1234567",
    }).success).toBe(false);
  });
});

describe("BCA departure transport", () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let client: KbttProviderClient;

  beforeEach(() => {
    client = new KbttProviderClient();
    fetchSpy = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => jest.restoreAllMocks());

  it("posts API 12 with its domestic wire fields", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ code: "200" }), { status: 200 }));
    const result = await client.changeDeparture("VIETNAMESE", [domesticCheckout], "test-token");
    expect(result.outcome).toBe("SUCCESS");
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://bca.invalid/client-service/kbtt-vn/kbtt-3th/doi-ngay-tra-phong",
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual([domesticCheckout]);
  });

  it("posts API 13 with its foreign wire fields", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ code: "200" }), { status: 200 }));
    await client.changeDeparture("FOREIGN", [foreignExtension], "test-token");
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://bca.invalid/client-service/kbtt/kbtt-3th/doi-ngay-tra-phong",
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual([foreignExtension]);
  });

  it("rejects invalid or empty requests before transmission", async () => {
    expect((await client.changeDeparture("VIETNAMESE", [], "test-token")).code).toBe("LOCAL_VALIDATION");
    expect((await client.changeDeparture("FOREIGN", [{ ...foreignExtension, thoiGianStr: undefined }], "test-token")).code)
      .toBe("LOCAL_VALIDATION");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not treat HTTP 200 with a business rejection as success", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ code: "400", message: "Rejected" }), { status: 200 }));
    expect((await client.changeDeparture("VIETNAMESE", [domesticCheckout], "test-token")).outcome)
      .toBe("BUSINESS_REJECTION");
  });

  it("keeps an HTTP failure ambiguous even when its body claims success", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ code: "200" }), { status: 503 }));
    expect((await client.changeDeparture("VIETNAMESE", [domesticCheckout], "test-token")).outcome)
      .toBe("AMBIGUOUS");
  });

  it("does not retry an ambiguous transmission", async () => {
    fetchSpy.mockRejectedValue(new Error("connection reset"));
    expect((await client.changeDeparture("VIETNAMESE", [domesticCheckout], "test-token")).outcome)
      .toBe("AMBIGUOUS");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves the original declaration endpoint", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ code: "200" }), { status: 200 }));
    await client.submitDeclaration("VIETNAMESE", [{ hoTen: "Nguyen Van An" }], "test-token");
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://bca.invalid/client-service/kbtt-vn/kbtt-3th");
  });
});
