import { I18nService } from "./i18n.service";

describe("I18nService", () => {
  const service = new I18nService();

  it("resolves supported locales from request headers", () => {
    expect(
      service.resolveLocale({
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    ).toBe("en");
  });

  it("prefers explicit lang query over accept-language", () => {
    expect(
      service.resolveLocale({
        query: { lang: "vi" },
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    ).toBe("vi");
  });

  it("translates catalog keys and interpolates params", () => {
    expect(service.t("errors.database.duplicateField", "en", { field: "email" })).toBe(
      "Duplicate value for field: email",
    );
    expect(service.t("errors.database.duplicateField", "vi", { field: "email" })).toBe(
      "Giá trị bị trùng cho trường: email",
    );
  });

  it("translates legacy API details when a catalog key is known", () => {
    expect(service.translateDetail("Required record not found", "vi")).toBe(
      "Không tìm thấy bản ghi bắt buộc",
    );
  });

  it("leaves unknown messages unchanged", () => {
    expect(service.t("Custom module message", "en")).toBe("Custom module message");
  });
});
