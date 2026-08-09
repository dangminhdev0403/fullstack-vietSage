import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { canTransitionMarketplaceOrder } from "../domain/marketplace-order-transitions";
import { MarketplaceOrderService } from "../application/marketplace-order.service";

describe("Marketplace orders", () => {
  it("enforces mode-specific state transitions", () => {
    expect(canTransitionMarketplaceOrder("PREPARING", "DELIVERING", "DELIVERY_TO_HOTEL")).toBe(true);
    expect(canTransitionMarketplaceOrder("PREPARING", "DELIVERING", "CUSTOMER_AT_SERVICE")).toBe(false);
    expect(canTransitionMarketplaceOrder("PREPARING", "READY", "CUSTOMER_AT_SERVICE")).toBe(true);
    expect(canTransitionMarketplaceOrder("COMPLETED", "CANCELLED", "DELIVERY_TO_HOTEL")).toBe(false);
  });

  it("fails atomically when finite capacity cannot be reserved", async () => {
    const tx = {
      marketplaceService: {
        findFirst: jest.fn().mockResolvedValue({ id: "item", serviceTenantId: "service", capacityAvailable: 0, unitPrice: new Prisma.Decimal(10), currency: "VND", name: "Spa", mode: "CUSTOMER_AT_SERVICE", waitingMinutes: 5 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: (fn: (value: unknown) => unknown) => fn(tx),
    };
    const service = new MarketplaceOrderService(prisma as never, {} as never);

    await expect(service.createGuestOrder({ hotelId: "hotel", stayId: "stay" }, { serviceId: "item", quantity: 1, idempotencyKey: "12345678" })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.marketplaceService.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ capacityAvailable: { gte: 1 } }) }));
  });
});
