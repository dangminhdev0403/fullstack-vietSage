import { GuestOsRepository } from "../guest-os.repository";

describe("GuestOsRepository QR scan lookup", () => {
  it("does not resolve the old QR token after rotation updates the public code", async () => {
    const rotatedQr = {
      id: "qr-1",
      publicCode: "token_new",
    };
    const prisma = {
      roomQRCode: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.publicCode === rotatedQr.publicCode
              ? Promise.resolve(rotatedQr)
              : Promise.resolve(null),
          ),
      },
    };
    const repository = new GuestOsRepository(prisma as never);

    await expect(repository.findQrForScan("token_old")).resolves.toBeNull();
    await expect(repository.findQrForScan("token_new")).resolves.toBe(rotatedQr);
  });
});

describe("GuestOsRepository category service lookup", () => {
  it("loads one active category for the guest hotel with paged active items and minimal select", async () => {
    const category = {
      id: "category-1",
      name: "Dining",
      description: "Food",
      defaultPrice: 100000,
      currency: "VND",
      items: [{ id: "item-1", name: "Pho", description: null, priceOverride: null }],
    };
    const prisma = {
      hotelServiceCategory: {
        findFirst: jest.fn().mockResolvedValue(category),
      },
      hotelServiceItem: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const repository = new GuestOsRepository(prisma as never);

    await expect(
      repository.findActiveServiceCategoryWithItems({
        hotelId: "hotel-1",
        categoryId: "category-1",
        skip: 20,
        take: 10,
      }),
    ).resolves.toEqual({ category, total: 1 });

    expect(prisma.hotelServiceCategory.findFirst).toHaveBeenCalledWith({
      where: {
        id: "category-1",
        hotelId: "hotel-1",
        status: "ACTIVE",
      },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        defaultPrice: true,
        currency: true,
        items: {
          where: {
            categoryId: "category-1",
            status: "ACTIVE",
          },
          orderBy: [{ sortOrder: "asc" }],
          skip: 20,
          take: 10,
          select: {
            id: true,
            name: true,
            description: true,
            priceOverride: true,
            quantityEnabled: true,
            minQuantity: true,
            maxQuantity: true,
            translations: true,
          },
        },
        translations: true,
      },
    });
    expect(prisma.hotelServiceItem.count).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        categoryId: "category-1",
        status: "ACTIVE",
      },
    });
  });
});

describe("GuestOsRepository request listing", () => {
  it("orders requests by highest priority first, then newest first", async () => {
    const rows = [{ id: "request-1" }];
    const tx = {
      guestRequest: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new GuestOsRepository(prisma as never);

    await expect(repository.listRequests({ stayId: "stay-1" }, 0, 20)).resolves.toEqual([1, rows]);

    expect(tx.guestRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stayId: "stay-1" },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip: 0,
        take: 20,
      }),
    );
  });
});

describe("GuestOsRepository request cancellation", () => {
  it("only cancels guest requests that are still CREATED", async () => {
    const request = { id: "request-1", status: "CANCELLED", serviceItem: null };
    const tx = {
      guestRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(request),
      },
      guestRequestEvent: {
        create: jest.fn().mockResolvedValue({ id: "event-1" }),
      },
      domainEvent: {
        create: jest.fn().mockResolvedValue({ id: "domain-event-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new GuestOsRepository(prisma as never);

    await expect(
      repository.cancelCreatedRequest({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        stayId: "stay-1",
        sessionId: "session-1",
        requestId: "request-1",
      }),
    ).resolves.toBe(request);

    expect(tx.guestRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        status: "NEW",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
      },
    });
    expect(tx.guestRequestEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: "request-1",
        hotelId: "hotel-1",
        actorType: "GUEST",
        sessionId: "session-1",
        eventType: "REQUEST_CANCELLED",
        fromStatus: "NEW",
        toStatus: "CANCELLED",
      }),
    });
    expect(tx.domainEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "REQUEST_CANCELLED",
        aggregateType: "GuestRequest",
        aggregateId: "request-1",
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        payload: { requestId: "request-1", stayId: "stay-1" },
      }),
    });
  });
});
