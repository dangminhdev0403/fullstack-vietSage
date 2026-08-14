import { ConflictException, BadRequestException } from "@nestjs/common";
import { MarketplaceCategorySheetService } from "../application/marketplace-category-sheet.service";

describe("MarketplaceCategorySheetService", () => {
  let service: MarketplaceCategorySheetService;
  let importServiceMock: any;

  beforeEach(() => {
    importServiceMock = {
      preview: jest.fn(),
      commit: jest.fn(),
    };
    service = new MarketplaceCategorySheetService(importServiceMock);
  });

  it("extracts spreadsheet ID from google sheets URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0";
    expect(service.extractSpreadsheetId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
  });

  it("throws error for invalid Google Sheets URL", () => {
    expect(() => service.extractSpreadsheetId("https://example.com/not-google-sheet")).toThrow(
      BadRequestException,
    );
  });

  it("previews workbook safely returning hash, summary, validation, and diff", async () => {
    const mockWorkbook = {
      fileName: "google-sheet:12345",
      sheets: [
        {
          name: "categories",
          rows: [{ rowNumber: 2, values: { category_key: "food", name_vi: "Ăn uống" } }],
        },
      ],
    };
    jest.spyOn(service as any, "readWorkbook").mockResolvedValue(mockWorkbook);

    importServiceMock.preview.mockResolvedValue({
      summary: {
        create: 1,
        update: 0,
        disable: 0,
        unchanged: 0,
        errors: 0,
        warnings: 0,
        totalEntities: 1,
      },
      validation: [],
      diff: [{ entityType: "MarketplaceCategory", key: "food", action: "create", changes: [] }],
      payload: { secret: "do not expose" },
      currentState: { secret: "do not expose" },
    });

    const result = await service.preview(
      "https://docs.google.com/spreadsheets/d/12345/edit",
      "user-1",
    );

    expect(result.workbookHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.summary.create).toBe(1);
    expect((result as any).payload).toBeUndefined();
    expect((result as any).currentState).toBeUndefined();
  });

  it("commits re-fetching workbook and rejecting hash mismatch", async () => {
    const mockWorkbook = {
      fileName: "google-sheet:12345",
      sheets: [
        {
          name: "categories",
          rows: [{ rowNumber: 2, values: { category_key: "food", name_vi: "Ăn uống" } }],
        },
      ],
    };
    jest.spyOn(service as any, "readWorkbook").mockResolvedValue(mockWorkbook);

    const validHash = service.computeWorkbookHash(mockWorkbook);

    importServiceMock.preview.mockResolvedValue({
      summary: {
        create: 1,
        update: 0,
        disable: 0,
        unchanged: 0,
        errors: 0,
        warnings: 0,
        totalEntities: 1,
      },
      validation: [],
      diff: [],
    });
    importServiceMock.commit.mockResolvedValue({
      summary: {
        create: 1,
        update: 0,
        disable: 0,
        unchanged: 0,
        errors: 0,
        warnings: 0,
        totalEntities: 1,
      },
    });

    // Valid commit
    const result = await service.commit(
      "https://docs.google.com/spreadsheets/d/12345/edit",
      validHash,
      "user-1",
    );
    expect(result.summary.create).toBe(1);

    // Mismatched hash
    await expect(
      service.commit(
        "https://docs.google.com/spreadsheets/d/12345/edit",
        "0000000000000000000000000000000000000000000000000000000000000000",
        "user-1",
      ),
    ).rejects.toThrow(ConflictException);
  });
});
