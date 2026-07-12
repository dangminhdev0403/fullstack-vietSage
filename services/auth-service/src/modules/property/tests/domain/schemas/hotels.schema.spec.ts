import { CategoryPriceUpdateMode } from "@prisma/client";
import { parseWithZod } from "../../../../../common/validation/parse-with-zod";
import { createHotelBodySchema, updateHotelBodySchema } from "../../../domain/schemas/hotel.schema";
import {
  listStaffRequestsQuerySchema,
  updateRequestAssignmentBodySchema,
} from "../../../domain/schemas/requests.schema";
import {
  createRoomBodySchema,
  createRoomsBodySchema,
  updateRoomBodySchema,
} from "../../../domain/schemas/rooms.schema";
import {
  createServiceCategoryBodySchema,
  createServiceItemBodySchema,
  updateServiceCategoryBodySchema,
} from "../../../domain/schemas/service-catalog.schema";

describe("hotels.schema", () => {
  it("phân tích dữ liệu tạo khách sạn không có mã do caller cung cấp", () => {
    const result = parseWithZod(createHotelBodySchema, {
      tenantId: "tenant-1",
      name: "Riverside Hotel",
    });

    expect(result).toEqual({ tenantId: "tenant-1", name: "Riverside Hotel" });
  });

  it("phân tích dữ liệu cập nhật khách sạn không có trường mã hoặc tenant", () => {
    const result = parseWithZod(updateHotelBodySchema, {
      name: " Riverside Hotel ",
      timezone: "Asia/Saigon",
      brandSettings: null,
    });

    expect(result).toEqual({
      name: "Riverside Hotel",
      timezone: "Asia/Saigon",
      brandSettings: null,
    });
  });

  it("từ chối cập nhật khách sạn rỗng", () => {
    expect(() => parseWithZod(updateHotelBodySchema, {})).toThrow(
      "Cần ít nhất một trường khách sạn",
    );
  });

  it("parses service category create data", () => {
    const result = parseWithZod(createServiceCategoryBodySchema, {
      name: " Dining ",
      description: "Room dining",
      defaultPrice: 100000,
      currency: "usd",
      sortOrder: "2",
    });

    expect(result).toEqual({
      name: "Dining",
      description: "Room dining",
      defaultPrice: 100000,
      currency: "usd",
      sortOrder: 2,
    });
  });

  it("rejects non-numeric service category prices", () => {
    expect(() =>
      parseWithZod(createServiceCategoryBodySchema, {
        name: "Dining",
        defaultPrice: "10.000",
      }),
    ).toThrow();
  });

  it("rejects negative service category prices", () => {
    expect(() =>
      parseWithZod(createServiceCategoryBodySchema, {
        name: "Dining",
        defaultPrice: -1,
      }),
    ).toThrow();
  });

  it("requires defaultPrice when overriding all item prices", () => {
    expect(() =>
      parseWithZod(updateServiceCategoryBodySchema, {
        priceUpdateMode: CategoryPriceUpdateMode.OVERRIDE_ALL_ITEMS,
      }),
    ).toThrow();
  });

  it("parses service item create data", () => {
    const result = parseWithZod(createServiceItemBodySchema, {
      categoryId: "category-1",
      name: "Pho",
      priceOverride: 120000,
      metadata: { sku: "pho" },
    });

    expect(result).toMatchObject({
      categoryId: "category-1",
      name: "Pho",
      priceOverride: 120000,
      metadata: { sku: "pho" },
    });
  });

  it("rejects legacy service item price fields", () => {
    expect(() =>
      parseWithZod(createServiceItemBodySchema, {
        categoryId: "category-1",
        name: "Pho",
        price: 120000,
      }),
    ).toThrow();
  });

  it("rejects formatted service item priceOverride strings", () => {
    expect(() =>
      parseWithZod(createServiceItemBodySchema, {
        categoryId: "category-1",
        name: "Pho",
        priceOverride: "10.000",
      }),
    ).toThrow();
  });

  it("cho phép phân công null để bỏ phân công yêu cầu", () => {
    const result = parseWithZod(updateRequestAssignmentBodySchema, {
      assignedToUserId: null,
      note: "Back to queue",
    });

    expect(result).toEqual({ assignedToUserId: null, note: "Back to queue" });
  });

  it("parses staff request list priority filter", () => {
    const result = parseWithZod(listStaffRequestsQuerySchema, {
      priority: "URGENT",
      page: "2",
      limit: "25",
    });

    expect(result).toEqual({
      priority: "URGENT",
      page: 2,
      limit: 25,
    });
  });

  it.each(["LOW", "HIGH"])("rejects unsupported staff request priority %s", (priority) => {
    expect(() =>
      parseWithZod(listStaffRequestsQuerySchema, {
        priority,
      }),
    ).toThrow();
  });

  it("parses room create data with price", () => {
    const result = parseWithZod(createRoomBodySchema, {
      roomNumber: " 101 ",
      floor: "1",
      type: "Deluxe",
      price: "1200000",
    });

    expect(result).toEqual({
      roomNumber: "101",
      floor: "1",
      type: "Deluxe",
      price: 1200000,
    });
  });

  it("parses bulk room create data", () => {
    const result = parseWithZod(createRoomsBodySchema, {
      items: [
        { roomNumber: " 101 ", floor: "1", type: "Deluxe", price: "1200000" },
        { roomNumber: "102", floor: "1", type: "Suite", price: "1500000" },
      ],
    });

    expect(result).toEqual({
      items: [
        { roomNumber: "101", floor: "1", type: "Deluxe", price: 1200000 },
        { roomNumber: "102", floor: "1", type: "Suite", price: 1500000 },
      ],
    });
  });

  it("parses room update data with price", () => {
    const result = parseWithZod(updateRoomBodySchema, {
      roomNumber: " 102 ",
      price: "1500000",
    });

    expect(result).toEqual({ roomNumber: "102", price: 1500000 });
  });

  it("rejects empty room updates", () => {
    expect(() => parseWithZod(updateRoomBodySchema, {})).toThrow("Cần ít nhất một trường phòng");
  });
});
