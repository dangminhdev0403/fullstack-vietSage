import { BadRequestException } from "@nestjs/common";
import { GuestMarketplaceController } from "../api/guest-marketplace.controller";
import type { GuestMarketplaceService } from "../application/guest-marketplace.service";
import type { MarketplaceOrderService } from "../application/marketplace-order.service";

describe("GuestMarketplaceController - cancelOrder", () => {
  let controller: GuestMarketplaceController;
  let service: jest.Mocked<Partial<GuestMarketplaceService>>;
  let orders: jest.Mocked<Partial<MarketplaceOrderService>>;

  const fakeReq = {
    guestSession: {
      hotelId: "hotel-1",
      stayId: "stay-1",
      sessionId: "session-1",
    },
  } as any;

  beforeEach(() => {
    service = {};
    orders = {
      cancelGuestOrder: jest.fn().mockResolvedValue({ id: "order-1", status: "CANCELLED" } as any),
    };

    controller = new GuestMarketplaceController(
      service as unknown as GuestMarketplaceService,
      orders as unknown as MarketplaceOrderService,
    );
  });

  it("accepts valid note and cancels order", async () => {
    await controller.cancelOrder(fakeReq, "order-1", { note: "Khách đổi kế hoạch" });
    expect(orders.cancelGuestOrder).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        stayId: "stay-1",
        sessionId: "session-1",
      },
      "order-1",
      "Khách đổi kế hoạch",
    );
  });

  it("accepts undefined or empty body", async () => {
    await controller.cancelOrder(fakeReq, "order-1", undefined);
    expect(orders.cancelGuestOrder).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        stayId: "stay-1",
        sessionId: "session-1",
      },
      "order-1",
      undefined,
    );

    await controller.cancelOrder(fakeReq, "order-1", {});
    expect(orders.cancelGuestOrder).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        stayId: "stay-1",
        sessionId: "session-1",
      },
      "order-1",
      undefined,
    );
  });

  it("trims the note", async () => {
    await controller.cancelOrder(fakeReq, "order-1", { note: "  Đổi ý  " });
    expect(orders.cancelGuestOrder).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        stayId: "stay-1",
        sessionId: "session-1",
      },
      "order-1",
      "Đổi ý",
    );
  });

  it("rejects note longer than 500 characters", () => {
    expect(() =>
      controller.cancelOrder(fakeReq, "order-1", { note: "a".repeat(501) }),
    ).toThrow(BadRequestException);
  });

  it("rejects extra properties due to strict schema", () => {
    expect(() =>
      controller.cancelOrder(fakeReq, "order-1", { note: "ok", extraField: "not allowed" }),
    ).toThrow(BadRequestException);
  });
});
