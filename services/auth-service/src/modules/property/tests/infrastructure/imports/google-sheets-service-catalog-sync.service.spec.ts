import { GoogleSheetsServiceCatalogSyncService } from "../../../infrastructure/imports/google-sheets-service-catalog-sync.service";

function createService() {
  return new GoogleSheetsServiceCatalogSyncService({} as never, {} as never, {} as never);
}

describe("GoogleSheetsServiceCatalogSyncService", () => {
  it("maps accented Google Sheet translation headers to import keys", () => {
    const service = createService() as unknown as {
      toParsedSheet: (
        name: "categories" | "items",
        values: unknown[][],
      ) => { rows: Array<{ values: Record<string, unknown> }> };
    };

    const sheet = service.toParsedSheet("categories", [
      [
        "Mã danh mục",
        "Tên danh mục (Tiếng Việt)",
        "Tên (Tiếng Anh)",
        "Mô tả (Tiếng Anh)",
        "Tên dịch vụ (Tiếng Hàn)",
        "Mô tả (Tiếng Hindi)",
      ],
      ["room_service", "Dịch vụ phòng", "Room service", "In-room dining", "룸서비스", "होटल सेवा"],
    ]);

    expect(sheet.rows[0].values).toMatchObject({
      category_key: "room_service",
      name_vi: "Dịch vụ phòng",
      name_en: "Room service",
      description_en: "In-room dining",
      name_ko: "룸서비스",
      description_hi: "होटल सेवा",
    });
  });
});
