import { MarketplaceCategoryImportAdapter } from "../infrastructure/imports/marketplace-category-import.adapter";
import { ParsedImportWorkbook } from "../../../common/import/import.types";

describe("MarketplaceCategoryImportAdapter", () => {
  let adapter: MarketplaceCategoryImportAdapter;
  let prismaMock: any;
  let codesMock: any;
  let registryMock: any;

  beforeEach(() => {
    prismaMock = {
      marketplaceCategory: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketplaceCategoryTranslation: {
        upsert: jest.fn(),
      },
    };
    codesMock = {
      generateEntityCode: jest.fn().mockResolvedValue("MPC-001"),
    };
    registryMock = {
      register: jest.fn(),
    };
    adapter = new MarketplaceCategoryImportAdapter(
      prismaMock as any,
      codesMock as any,
      registryMock as any,
    );
  });

  it("registers itself as marketplace-categories supporting upsert and replace modes", () => {
    expect(adapter.type).toBe("marketplace-categories");
    expect(adapter.supportedModes).toEqual(["upsert", "replace"]);
    adapter.onModuleInit();
    expect(registryMock.register).toHaveBeenCalledWith(adapter);
  });

  it("requires actorUserId in authorize context", () => {
    expect(() => adapter.authorize({ actorUserId: "" })).toThrow();
    expect(() => adapter.authorize({ actorUserId: "user-123" })).not.toThrow();
  });

  it("parses canonical and aliased sheet columns", () => {
    const workbook: ParsedImportWorkbook = {
      fileName: "test.xlsx",
      sheets: [
        {
          name: "categories",
          rows: [
            {
              rowNumber: 2,
              values: {
                "Mã danh mục": "food_beverage",
                "Tên tiếng Việt": "Ăn uống & Giải trí",
                "Thứ tự": 1,
                "Trạng thái": "ACTIVE",
                "Tên tiếng Anh": "Food & Beverage",
                "Tên tiếng Trung": "餐饮",
              },
            },
          ],
        },
      ],
    };

    const parsed = adapter.parse(workbook, { actorUserId: "user-1" });
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0]).toEqual({
      rowNumber: 2,
      importKey: "food_beverage",
      nameVi: "Ăn uống & Giải trí",
      sortOrder: 1,
      isActive: true,
      translations: {
        en: "Food & Beverage",
        zh: "餐饮",
      },
    });
  });

  it("validates required fields, key format, duplicates, and invalid status", async () => {
    const payload = {
      categories: [
        {
          rowNumber: 2,
          importKey: "INVALID KEY!",
          nameVi: "Invalid Key Test",
          sortOrder: 0,
          isActive: true,
          translations: {},
        },
        {
          rowNumber: 3,
          importKey: "dup_key",
          nameVi: "",
          sortOrder: 0,
          isActive: true,
          translations: {},
        },
        {
          rowNumber: 4,
          importKey: "dup_key",
          nameVi: "Dup Key Test",
          sortOrder: -1,
          isActive: false,
          translations: {},
        },
      ],
    };

    const issues = await adapter.validate(payload, { actorUserId: "user-1" });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.code === "INVALID_KEY_FORMAT")).toBe(true);
    expect(issues.some((i) => i.code === "DUPLICATE_KEY")).toBe(true);
    expect(issues.some((i) => i.code === "REQUIRED_FIELD_MISSING")).toBe(true);
  });

  it("diffs new creates, updates, and unchanged rows while preserving blank translations", async () => {
    const state = {
      existingByKey: new Map([
        [
          "spa",
          {
            id: "cat-1",
            code: "MPC-000",
            importKey: "spa",
            nameVi: "Spa & Massage",
            sortOrder: 2,
            isActive: true,
            translations: [
              { id: "tr-1", categoryId: "cat-1", locale: "en", name: "Spa & Massage" },
            ],
          },
        ],
      ]),
    };

    const payload = {
      categories: [
        {
          rowNumber: 2,
          importKey: "tours",
          nameVi: "Tour du lịch",
          sortOrder: 1,
          isActive: true,
          translations: { en: "Tours" },
        },
        {
          rowNumber: 3,
          importKey: "spa",
          nameVi: "Spa & Massage Cao Cấp",
          sortOrder: 2,
          isActive: true,
          translations: { en: "Spa & Massage" }, // en unchanged
        },
      ],
    };

    const diffs = await adapter.diff(payload, state as any, { actorUserId: "user-1" }, "upsert");
    expect(diffs).toHaveLength(2);
    expect(diffs[0].action).toBe("create");
    expect(diffs[0].key).toBe("tours");
    expect(diffs[1].action).toBe("update");
    expect(diffs[1].key).toBe("spa");
    expect(diffs[1].changes).toEqual([
      { field: "nameVi", from: "Spa & Massage", to: "Spa & Massage Cao Cấp" },
    ]);
  });

  it("commits atomic upserts in a transaction", async () => {
    const txMock: any = {
      marketplaceCategory: {
        create: jest.fn().mockResolvedValue({ id: "cat-new", code: "MPC-001" }),
        update: jest.fn().mockResolvedValue({ id: "cat-1", code: "MPC-000" }),
      },
      marketplaceCategoryTranslation: {
        upsert: jest.fn().mockResolvedValue({ id: "tr-new" }),
      },
    };

    const payload = {
      categories: [
        {
          rowNumber: 2,
          importKey: "tours",
          nameVi: "Tour du lịch",
          sortOrder: 1,
          isActive: true,
          translations: { en: "Tours" },
        },
      ],
    };

    const state = { existingByKey: new Map() };
    const diff = [
      {
        entityType: "MarketplaceCategory",
        key: "tours",
        action: "create" as const,
        changes: [],
      },
    ];

    const result = await adapter.commit({
      tx: txMock,
      mode: "upsert",
      context: { actorUserId: "user-1" },
      payload,
      currentState: state as any,
      diff,
    });

    expect(codesMock.generateEntityCode).toHaveBeenCalledWith("MARKETPLACE_CATEGORY", txMock);
    expect(txMock.marketplaceCategory.create).toHaveBeenCalled();
    expect(txMock.marketplaceCategoryTranslation.upsert).toHaveBeenCalledWith({
      where: { categoryId_locale: { categoryId: "cat-new", locale: "en" } },
      create: { categoryId: "cat-new", locale: "en", name: "Tours" },
      update: { name: "Tours" },
    });
    expect(result.summary.create).toBe(1);
  });
});
