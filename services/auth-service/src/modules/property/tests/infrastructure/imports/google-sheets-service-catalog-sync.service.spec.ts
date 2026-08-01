import { GoogleSheetsServiceCatalogSyncService } from "../../../infrastructure/imports/google-sheets-service-catalog-sync.service";

function createService(importService: Record<string, unknown> = {}) {
  return new GoogleSheetsServiceCatalogSyncService(
    importService as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("GoogleSheetsServiceCatalogSyncService", () => {
  it("removes invalid rows, previews again, then commits valid rows", async () => {
    const firstPreview = {
      validation: [
        {
          severity: "error",
          sheet: "items",
          row: 3,
          column: "category_key",
          code: "CATEGORY_KEY_NOT_FOUND",
          message: 'Mã nhóm "spa" chưa có trong tab Nhóm dịch vụ',
        },
      ],
    };
    const cleanPreview = { validation: [], marker: "clean" };
    const importService = {
      preview: jest.fn().mockResolvedValueOnce(firstPreview).mockResolvedValueOnce(cleanPreview),
    };
    const service = createService(importService) as unknown as {
      previewValidRows: (input: Record<string, unknown>) => Promise<{
        preview: unknown;
        skippedIssues: Array<Record<string, unknown>>;
      }>;
    };
    const workbook = {
      fileName: "sheet",
      sheets: [
        { name: "categories", rows: [{ rowNumber: 2, values: { category_key: "room" } }] },
        {
          name: "items",
          rows: [
            { rowNumber: 2, values: { item_key: "valid" } },
            { rowNumber: 3, values: { item_key: "invalid" } },
          ],
        },
      ],
    };

    const result = await service.previewValidRows({
      type: "service-catalog",
      mode: "upsert",
      context: {},
      workbook,
    });

    expect(result.preview).toBe(cleanPreview);
    expect(result.skippedIssues).toEqual(firstPreview.validation);
    expect(importService.preview).toHaveBeenCalledTimes(2);
    expect(importService.preview.mock.calls[1][0].workbook.sheets[1].rows).toEqual([
      { rowNumber: 2, values: { item_key: "valid" } },
    ]);
  });

  it("rejects replace sync when a required sheet has no valid rows", async () => {
    const importService = { preview: jest.fn().mockResolvedValue({ validation: [] }) };
    const service = createService(importService) as unknown as {
      previewValidRows: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(
      service.previewValidRows({
        type: "service-catalog",
        mode: "replace",
        context: {},
        workbook: {
          fileName: "sheet",
          sheets: [
            { name: "categories", rows: [{ rowNumber: 2, values: {} }] },
            { name: "items", rows: [] },
          ],
        },
      }),
    ).rejects.toThrow("không có dòng dữ liệu hợp lệ");
  });

  it("keeps sheet-level validation errors blocking", async () => {
    const importService = {
      preview: jest.fn().mockResolvedValue({
        validation: [
          {
            severity: "error",
            sheet: "items",
            code: "REQUIRED_COLUMN_MISSING",
            message: "Thiếu cột bắt buộc",
          },
        ],
      }),
    };
    const service = createService(importService) as unknown as {
      previewValidRows: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(
      service.previewValidRows({
        type: "service-catalog",
        mode: "upsert",
        context: {},
        workbook: { fileName: "sheet", sheets: [{ name: "items", rows: [] }] },
      }),
    ).rejects.toThrow("Thiếu cột bắt buộc");
  });

  it("removes items depending on an invalid category within two previews", async () => {
    const importService = {
      preview: jest.fn().mockImplementation(({ workbook }) => {
        const categoryRows = workbook.sheets.find((sheet) => sheet.name === "categories").rows;
        const itemRows = workbook.sheets.find((sheet) => sheet.name === "items").rows;
        if (categoryRows.some((row) => row.rowNumber === 2)) {
          return {
            validation: [
              {
                severity: "error",
                sheet: "categories",
                row: 2,
                column: "category_key",
                code: "INVALID_KEY",
                message: "Mã nhóm không hợp lệ",
              },
            ],
          };
        }
        if (itemRows.some((row) => row.values.category_key === "bad category")) {
          return {
            validation: [
              {
                severity: "error",
                sheet: "items",
                row: 2,
                column: "category_key",
                code: "CATEGORY_KEY_NOT_FOUND",
                message: 'Mã nhóm "bad category" chưa có trong tab Nhóm dịch vụ',
              },
            ],
          };
        }
        return { validation: [], marker: "clean" };
      }),
    };
    const service = createService(importService) as unknown as {
      previewValidRows: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await service.previewValidRows({
      type: "service-catalog",
      mode: "upsert",
      context: {},
      workbook: {
        fileName: "sheet",
        sheets: [
          {
            name: "categories",
            rows: [{ rowNumber: 2, values: { category_key: "bad category" } }],
          },
          {
            name: "items",
            rows: [{ rowNumber: 2, values: { category_key: "bad category" } }],
          },
        ],
      },
    });

    expect(importService.preview).toHaveBeenCalledTimes(2);
  });

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
