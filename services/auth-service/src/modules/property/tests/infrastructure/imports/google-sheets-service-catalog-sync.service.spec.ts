import { GoogleSheetsServiceCatalogSyncService } from "../../../infrastructure/imports/google-sheets-service-catalog-sync.service";

function createService() {
  return new GoogleSheetsServiceCatalogSyncService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("GoogleSheetsServiceCatalogSyncService", () => {
  it("summarizes repeated missing category errors", () => {
    const service = createService() as unknown as {
      formatValidationErrors: (issues: Array<Record<string, unknown>>) => string;
    };

    expect(
      service.formatValidationErrors([
        {
          sheet: "items",
          row: 6,
          column: "category_key",
          code: "CATEGORY_KEY_NOT_FOUND",
          message: 'Mã nhóm "food_ordering" chưa có trong tab Nhóm dịch vụ',
        },
        {
          sheet: "items",
          row: 7,
          column: "category_key",
          code: "CATEGORY_KEY_NOT_FOUND",
          message: 'Mã nhóm "food_ordering" chưa có trong tab Nhóm dịch vụ',
        },
        {
          sheet: "items",
          row: 10,
          column: "category_key",
          code: "CATEGORY_KEY_NOT_FOUND",
          message: 'Mã nhóm "spa" chưa có trong tab Nhóm dịch vụ',
        },
      ]),
    ).toBe(
      "Tab Dịch vụ đang dùng mã nhóm chưa có trong tab Nhóm dịch vụ: food_ordering (dòng 6, 7); spa (dòng 10). Hãy thêm các mã nhóm này vào tab Nhóm dịch vụ rồi đồng bộ lại.",
    );
  });

  it("uses the first two sheet tabs regardless of their names", () => {
    const service = createService() as unknown as {
      rangesForFirstTwoSheets: (titles: string[]) => string[];
    };

    expect(service.rangesForFirstTwoSheets(["Nhóm dịch vụ", "Dịch vụ"])).toEqual([
      "'Nhóm dịch vụ'!A1:Z",
      "'Dịch vụ'!A1:Z",
    ]);
  });

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
