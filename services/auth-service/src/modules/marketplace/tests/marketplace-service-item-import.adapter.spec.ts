import { MarketplaceServiceItemImportAdapter } from "../infrastructure/imports/marketplace-service-item-import.adapter";
import { ServiceItemImportService } from "../application/service-item-import.service";

describe("Marketplace service item import", () => {
  const adapter = new MarketplaceServiceItemImportAdapter(
    {} as never,
    { generateEntityCode: jest.fn() } as never,
    { register: jest.fn() } as never,
  );

  it("accepts only tenant-owned item fields", () => {
    const payload = adapter.parse(
      {
        fileName: "items.csv",
        sheets: [
          {
            name: "items",
            rows: [
              {
                rowNumber: 2,
                values: {
                  name_vi: "Massage 60",
                  description_vi: "",
                  unit_price: "450000",
                  preparation_minutes: "15",
                  capacity: "",
                  fulfillment_method: "1",
                  status: "2",
                  name_en: "60-minute massage",
                },
              },
            ],
          },
        ],
      },
      {} as never,
    );
    expect(adapter.validate(payload, {} as never)).toEqual([]);
    expect(payload.items[0]).toMatchObject({
      name: "Massage 60",
      mode: "CUSTOMER_AT_SERVICE",
      status: "DISABLED",
      translations: { en: { name: "60-minute massage", description: null } },
    });
  });

  it("rejects duplicate Vietnamese names because Excel has no manual code", () => {
    const payload = adapter.parse(
      {
        fileName: "items.csv",
        sheets: [
          {
            name: "items",
            rows: [
              {
                rowNumber: 2,
                values: {
                  name_vi: "Massage 60",
                  unit_price: "1",
                  preparation_minutes: "1",
                  fulfillment_method: "CUSTOMER_AT_SERVICE",
                  status: "ACTIVE",
                },
              },
              {
                rowNumber: 3,
                values: {
                  name_vi: "massage 60",
                  unit_price: "1",
                  preparation_minutes: "1",
                  fulfillment_method: "CUSTOMER_AT_SERVICE",
                  status: "ACTIVE",
                },
              },
              {
                rowNumber: 4,
                values: {
                  name_vi: "Other",
                  unit_price: "1",
                  preparation_minutes: "1",
                  fulfillment_method: "CUSTOMER_AT_SERVICE",
                  status: "ACTIVE",
                },
              },
            ],
          },
        ],
      },
      {} as never,
    );
    const issues = adapter.validate(payload, {} as never);
    expect(issues.some((issue) => issue.code === "DUPLICATE_NAME")).toBe(true);
  });

  it("rejects missing required enums, oversized text, and prices with excess scale", () => {
    const payload = adapter.parse(
      {
        fileName: "items.csv",
        sheets: [
          {
            name: "items",
            rows: [
              {
                rowNumber: 2,
                values: {
                  name_vi: "x".repeat(161),
                  description_vi: "x".repeat(1001),
                  unit_price: "1.234",
                  preparation_minutes: "15",
                  capacity: "",
                  fulfillment_method: "",
                  status: "",
                },
              },
            ],
          },
        ],
      },
      {} as never,
    );

    const codes = adapter.validate(payload, {} as never).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(["MAX_LENGTH_EXCEEDED", "INVALID_PRICE_SCALE", "INVALID_ENUM"]),
    );
  });

  it("publishes a system-managed service code column", () => {
    const service = new ServiceItemImportService({} as never, adapter);
    const template = service.template();
    expect(template).toContain("Mã dịch vụ (Hệ thống tự sinh - không chỉnh sửa)");
    expect(template).toContain("Tên dịch vụ (Tiếng Việt)");
    expect(template).toContain("1 - Phục vụ tại địa điểm");
    expect(template).toContain("2 - Tạm ẩn");
  });

  it("escapes spreadsheet formulas in CSV export", async () => {
    const prisma = {
      tenantUser: { findMany: jest.fn().mockResolvedValue([{ tenantId: "tenant-1" }]) },
      serviceTenantProfile: { findUnique: jest.fn().mockResolvedValue({ category: {} }) },
      marketplaceService: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "item-1",
            importKey: "item-1",
            name: '=HYPERLINK("https://evil.invalid")',
            description: null,
            unitPrice: 1,
            waitingMinutes: 0,
            capacityAvailable: null,
            mode: "CUSTOMER_AT_SERVICE",
            status: "ACTIVE",
          },
        ]),
      },
    };
    const service = new ServiceItemImportService(prisma as never, adapter);

    const csv = await service.export("user-1");

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("\n=HYPERLINK");
  });

  it("generates service codes inside the import transaction", async () => {
    const create = jest.fn().mockResolvedValue({ id: "created" });
    const generateEntityCode = jest
      .fn()
      .mockResolvedValueOnce("VSH_MARKETPLACE_SERVICE_0001")
      .mockResolvedValueOnce("VSH_MARKETPLACE_SERVICE_0002");
    const commitAdapter = new MarketplaceServiceItemImportAdapter(
      {} as never,
      { generateEntityCode } as never,
      { register: jest.fn() } as never,
    );
    const rows = ["one", "two"].map((name, index) => ({
      rowNumber: index + 2,
      itemKey: "",
      name,
      description: null,
      unitPrice: 1,
      preparationMinutes: 0,
      capacity: null,
      mode: "CUSTOMER_AT_SERVICE" as const,
      status: "ACTIVE" as const,
      translations: {},
    }));

    await commitAdapter.commit({
      tx: {
        marketplaceService: { create, updateMany: jest.fn() },
        marketplaceServiceTranslation: { upsert: jest.fn() },
      } as never,
      mode: "upsert",
      context: { actorUserId: "user-1", tenantId: "tenant-1" },
      payload: { items: rows },
      currentState: { categoryId: "category-1", categoryActive: true, items: [] },
      diff: [],
    });

    expect(generateEntityCode).toHaveBeenCalledTimes(2);
    expect(generateEntityCode).toHaveBeenCalledWith("MARKETPLACE_SERVICE", expect.anything());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data.importKey).toBe("VSH_MARKETPLACE_SERVICE_0001");
  });

  it("rejects a service code outside the current Service Tenant", () => {
    const payload = adapter.parse(
      {
        fileName: "items.csv",
        sheets: [
          {
            name: "items",
            rows: [
              {
                rowNumber: 2,
                values: {
                  item_key: "VSH_MARKETPLACE_SERVICE_9999",
                  name_vi: "Massage",
                  unit_price: "1",
                  preparation_minutes: "0",
                  capacity: "",
                  fulfillment_method: "1",
                  status: "1",
                },
              },
            ],
          },
        ],
      },
      {} as never,
    );
    expect(
      adapter.validateState(payload, { categoryId: "category-1", categoryActive: true, items: [] }),
    ).toEqual([expect.objectContaining({ code: "SERVICE_CODE_NOT_FOUND", row: 2 })]);
  });

  it("updates by service code even when the Vietnamese name changes", () => {
    const payload = adapter.parse(
      {
        fileName: "items.csv",
        sheets: [
          {
            name: "items",
            rows: [
              {
                rowNumber: 2,
                values: {
                  item_key: "VSH_MARKETPLACE_SERVICE_0001",
                  name_vi: "Tên mới",
                  unit_price: "1",
                  preparation_minutes: "0",
                  capacity: "",
                  fulfillment_method: "1",
                  status: "1",
                },
              },
            ],
          },
        ],
      },
      {} as never,
    );
    const diff = adapter.diff(
      payload,
      {
        categoryId: "category-1",
        categoryActive: true,
        items: [
          {
            id: "item-1",
            importKey: "VSH_MARKETPLACE_SERVICE_0001",
            name: "Tên cũ",
            description: null,
            unitPrice: 1,
            waitingMinutes: 0,
            capacityAvailable: null,
            mode: "CUSTOMER_AT_SERVICE",
            status: "ACTIVE",
          },
        ],
      },
      {} as never,
      "upsert",
    );
    expect(diff[0]).toMatchObject({ key: "VSH_MARKETPLACE_SERVICE_0001", action: "update" });
  });

  it("repairs a blank sheet code from an existing same-name service", async () => {
    const result = await adapter.commit({
      tx: {
        marketplaceService: {
          create: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        marketplaceServiceTranslation: { upsert: jest.fn() },
      } as never,
      mode: "upsert",
      context: { actorUserId: "user-1", tenantId: "tenant-1" },
      payload: {
        items: [
          {
            rowNumber: 2,
            itemKey: "",
            name: "Massage",
            description: null,
            unitPrice: 1,
            preparationMinutes: 0,
            capacity: null,
            mode: "CUSTOMER_AT_SERVICE",
            status: "ACTIVE",
            translations: {},
          },
        ],
      },
      currentState: {
        categoryId: "category-1",
        categoryActive: true,
        items: [
          {
            id: "item-1",
            importKey: "VSH_MARKETPLACE_SERVICE_0001",
            name: "Massage",
            description: null,
            unitPrice: 1,
            waitingMinutes: 0,
            capacityAvailable: null,
            mode: "CUSTOMER_AT_SERVICE",
            status: "ACTIVE",
          },
        ],
      },
      diff: [],
    });
    expect(result.auditPayload?.generatedCodes).toEqual([
      { rowNumber: 2, code: "VSH_MARKETPLACE_SERVICE_0001" },
    ]);
  });
});
