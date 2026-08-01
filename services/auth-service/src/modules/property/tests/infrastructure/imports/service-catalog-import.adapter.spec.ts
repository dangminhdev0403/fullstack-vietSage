import { ServiceCatalogImportAdapter } from "../../../infrastructure/imports/service-catalog-import.adapter";
import { ServiceCatalogStatus } from "@prisma/client";

function createAdapter() {
  return new ServiceCatalogImportAdapter({} as never, {} as never, {} as never);
}

describe("ServiceCatalogImportAdapter", () => {
  it("supports replace mode", () => {
    expect(createAdapter().supportedModes).toContain("replace");
  });

  it("disables imported records missing from Excel but preserves invalid-row keys", () => {
    const adapter = createAdapter();
    const diff = adapter.diff(
      { categories: [], items: [] },
      {
        categories: [
          { importKey: "remove_category", name: "Remove" },
          { importKey: "invalid_category", name: "Keep" },
        ],
        items: [
          { importKey: "remove_item", name: "Remove", category: { importKey: "remove_category" } },
          { importKey: "invalid_item", name: "Keep", category: { importKey: "invalid_category" } },
        ],
      } as never,
      {
        hotelId: "hotel-1",
        preserveCategoryImportKeys: ["invalid_category"],
        preserveItemImportKeys: ["invalid_item"],
      },
      "replace",
    );

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "serviceItem",
          key: "remove_item",
          action: "disable",
        }),
        expect.objectContaining({
          entityType: "serviceCategory",
          key: "remove_category",
          action: "disable",
        }),
      ]),
    );
    expect(diff.map((entry) => entry.key)).not.toContain("invalid_item");
    expect(diff.map((entry) => entry.key)).not.toContain("invalid_category");
  });

  it("marks removal of an Excel translation as an update", () => {
    const adapter = createAdapter();
    const category = {
      rowNumber: 2,
      importKey: "room_service",
      name: "Dịch vụ phòng",
      description: null,
      defaultPrice: 0,
      currency: "VND",
      sortOrder: 10,
      status: ServiceCatalogStatus.ACTIVE,
      translations: {},
    };
    const diff = adapter.diff(
      { categories: [category], items: [] },
      {
        categories: [
          {
            ...category,
            id: "category-1",
            translations: [{ locale: "en", name: "Room service", description: null }],
          },
        ],
        items: [],
      } as never,
      { hotelId: "hotel-1" },
      "replace",
    );

    expect(diff[0]).toMatchObject({ action: "update" });
    expect(diff[0].changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "translations.en.name", from: "Room service", to: null }),
      ]),
    );
  });

  it("reports the missing category key in Vietnamese", () => {
    const adapter = createAdapter();
    const issues = adapter.validate({
      categories: [],
      items: [
        {
          rowNumber: 6,
          importKey: "fried_rice",
          categoryKey: "food_ordering",
          name: "Cơm rang",
          priceOverride: null,
          quantityEnabled: false,
          minQuantity: 1,
          maxQuantity: null,
          sortOrder: 0,
          status: ServiceCatalogStatus.ACTIVE,
          translations: {},
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CATEGORY_KEY_NOT_FOUND",
          message: 'Mã nhóm "food_ordering" chưa có trong tab Nhóm dịch vụ',
        }),
      ]),
    );
  });

  it("parses service catalog translations with supported content locale keys", () => {
    const adapter = createAdapter();

    const payload = adapter.parse({
      fileName: "test",
      sheets: [
        {
          name: "categories",
          rows: [
            {
              rowNumber: 2,
              values: {
                category_key: "room_service",
                name_vi: "Dịch vụ phòng",
                default_price: 0,
                name_en: "Room service",
                description_en: "In-room dining",
                name_zh: "客房服务",
              },
            },
          ],
        },
        {
          name: "items",
          rows: [
            {
              rowNumber: 2,
              values: {
                item_key: "pho",
                category_key: "room_service",
                name_vi: "Phở",
                name_en: "Pho",
                description_en: "Vietnamese noodle soup",
                name_ko: "쌀국수",
              },
            },
          ],
        },
      ],
    });

    expect(payload.categories[0].translations).toEqual({
      en: { name: "Room service", description: "In-room dining" },
      zh: { name: "客房服务", description: undefined },
    });
    expect(payload.items[0].translations).toEqual({
      en: { name: "Pho", description: "Vietnamese noodle soup" },
      ko: { name: "쌀국수", description: undefined },
    });
  });
});
