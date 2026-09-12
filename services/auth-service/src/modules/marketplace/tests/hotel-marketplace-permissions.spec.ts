import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { HotelMarketplaceController } from "../api/hotel-marketplace.controller";

describe("HotelMarketplaceController permissions", () => {
  const prototype = HotelMarketplaceController.prototype as unknown as Record<string, unknown>;

  it("không bao giờ sử dụng quyền .view cho các mutation acknowledge, voucher, cancel", () => {
    const mutationMethods = ["acknowledge", "issueVoucher", "cancel"] as const;

    for (const method of mutationMethods) {
      const permission = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype[method]) as string;
      expect(permission).toBeDefined();
      expect(permission.endsWith(".view")).toBe(false);
      expect(permission).toContain(".execute");
    }
  });

  it("gán quyền hotel.requests.execute cho acknowledge, issueVoucher, và cancel", () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.acknowledge)).toBe(
      "hotel.requests.execute",
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.issueVoucher)).toBe(
      "hotel.requests.execute",
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.cancel)).toBe(
      "hotel.requests.execute",
    );
  });

  it("giữ nguyên quyền view cho các endpoint truy vấn", () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.list)).toBe("hotel.requests.view");
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.order)).toBe(
      "hotel.marketplace.view",
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.revenue)).toBe(
      "hotel.marketplace.revenue.view",
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype.settlements)).toBe(
      "hotel.marketplace.view",
    );
  });
});
