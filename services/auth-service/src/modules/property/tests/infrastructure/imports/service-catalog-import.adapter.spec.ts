import { ServiceCatalogImportAdapter } from "../../../infrastructure/imports/service-catalog-import.adapter";

function createAdapter() {
  return new ServiceCatalogImportAdapter({} as never, {} as never, {} as never);
}

describe("ServiceCatalogImportAdapter", () => {
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
