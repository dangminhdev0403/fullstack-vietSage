import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  GuestRequestPriority,
  GuestRequestStatus,
  GuestSessionStatus,
  Prisma,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { GuestOsService, ROOM_ACCESS_UNAVAILABLE_MESSAGE } from "../guest-os.service";
import { listGuestRequestsQuerySchema, scanQrBodySchema } from "../schemas/guest-os.schema";

describe("GuestOsService", () => {
  it.each(["CREATED", "CREATE", "IN_PROGRESS"] as const)(
    "accepts guest request status filter %s",
    (status) => {
      expect(listGuestRequestsQuerySchema.parse({ status })).toMatchObject({ status });
    },
  );

  it("denies unknown QR scans with the front desk message", async () => {
    const repository = {
      findQrForScan: jest.fn().mockResolvedValue(null),
      recordQrScan: jest.fn().mockResolvedValue({}),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.scanQr({ qrCode: "unknown" }, {
        headers: {},
        ip: "127.0.0.1",
      } as never),
    ).rejects.toMatchObject({
      response: { message: ROOM_ACCESS_UNAVAILABLE_MESSAGE },
    });

    expect(repository.recordQrScan).toHaveBeenCalledWith({
      aggregateId: "unknown",
      hotelId: undefined,
      tenantId: undefined,
      payload: expect.objectContaining({
        deniedReason: "UNKNOWN_QR",
        publicCodeTail: "unknown",
        ipHashTail: expect.any(String),
      }),
    });
  });

  it("rejects accessCode in the scan QR request body", () => {
    expect(() =>
      scanQrBodySchema.parse({
        qrCode: "token_value",
        accessCode: "legacy-code",
      }),
    ).toThrow();
  });

  it("returns only guest-safe display data after a QR scan", async () => {
    const plannedCheckOutAt = new Date(Date.now() + 60_000);
    const expiresAt = new Date(Date.now() + 30_000);
    const repository = {
      findQrForScan: jest.fn().mockResolvedValue({
        id: "qr-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: RoomQRCodeStatus.ACTIVE,
        hotel: {
          tenantId: "tenant-1",
          id: "hotel-1",
          name: "Hotel",
          code: "hotel",
          timezone: "Asia/Saigon",
          brandSettings: { primaryColor: "#123456" },
        },
        room: { id: "room-1", status: RoomStatus.OCCUPIED },
      }),
      recordQrScan: jest.fn().mockResolvedValue({}),
      findActiveStayForRoom: jest.fn().mockResolvedValue({
        id: "stay-1",
        reservationCode: "RSV-001",
        status: "ACTIVE",
        plannedCheckOutAt,
        checkedOutAt: null,
      }),
      isAccessOpen: jest.fn().mockReturnValue(true),
      createGuestSession: jest.fn().mockResolvedValue({
        expiresAt,
        hotel: {
          id: "hotel-1",
          tenantId: "tenant-1",
          name: "Hotel",
          code: "hotel",
          timezone: "Asia/Saigon",
          brandSettings: { primaryColor: "#123456" },
        },
        room: {
          id: "room-1",
          roomNumber: "1201",
          floor: "12",
          type: "DELUXE",
          status: RoomStatus.OCCUPIED,
        },
        stay: {
          id: "stay-1",
          reservationCode: "RSV-001",
          guestDisplayName: "Jane Guest",
          status: "ACTIVE",
          plannedCheckOutAt,
          checkedOutAt: null,
        },
      }),
    };
    const service = new GuestOsService(repository as never);

    const response = await service.scanQr({ qrCode: "qr" }, {
      headers: {},
      ip: "127.0.0.1",
    } as never);

    expect(response).toMatchObject({
      sessionToken: expect.any(String),
      expiresAt,
      hotel: {
        name: "Hotel",
        timezone: "Asia/Saigon",
        brandSettings: { primaryColor: "#123456" },
      },
      room: {
        roomNumber: "1201",
        floor: "12",
        type: "DELUXE",
      },
      guest: {
        displayName: "Jane Guest",
        plannedCheckOutAt,
      },
    });
    expect(response).not.toHaveProperty("stay");
    expect(response.hotel).not.toHaveProperty("id");
    expect(response.hotel).not.toHaveProperty("tenantId");
    expect(response.hotel).not.toHaveProperty("code");
    expect(response.room).not.toHaveProperty("id");
    expect(response.room).not.toHaveProperty("status");
    expect(response.guest).not.toHaveProperty("id");
    expect(response.guest).not.toHaveProperty("reservationCode");
    expect(response.guest).not.toHaveProperty("status");
    expect(response.guest).not.toHaveProperty("checkedOutAt");
    expect(repository.createGuestSession).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
      }),
    );
  });

  it("rejects the sixth active guest session for a stay", async () => {
    const repository = {
      findQrForScan: jest.fn().mockResolvedValue({
        id: "qr-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: RoomQRCodeStatus.ACTIVE,
        hotel: {
          tenantId: "tenant-1",
          id: "hotel-1",
          name: "Hotel",
          code: "hotel",
          timezone: "Asia/Saigon",
          brandSettings: null,
        },
        room: { id: "room-1", status: RoomStatus.OCCUPIED },
      }),
      recordQrScan: jest.fn().mockResolvedValue({}),
      findActiveStayForRoom: jest.fn().mockResolvedValue({
        id: "stay-1",
        status: "ACTIVE",
        plannedCheckOutAt: new Date(Date.now() + 60_000),
      }),
      isAccessOpen: jest.fn().mockReturnValue(true),
      createGuestSession: jest.fn().mockRejectedValue(new Error("GUEST_SESSION_LIMIT_REACHED")),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.scanQr({ qrCode: "qr" }, {
        headers: {},
        ip: "127.0.0.1",
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("builds active session context from a valid guest token", async () => {
    const repository = {
      findSessionByTokenHash: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
    };
    const service = new GuestOsService(repository as never);

    await expect(service.authenticateGuestToken("guest-token")).resolves.toMatchObject({
      sessionId: "session-1",
      status: GuestSessionStatus.ACTIVE,
    });
  });

  it("lists active service catalog for the guest hotel", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      listActiveServiceCatalog: jest.fn().mockResolvedValue([
        {
          id: "category-1",
          defaultPrice: 100000,
          currency: "VND",
          items: [
            {
              id: "item-1",
              priceOverride: null,
              quantityEnabled: false,
              minQuantity: 1,
              maxQuantity: null,
            },
            {
              id: "item-2",
              priceOverride: 120000,
              quantityEnabled: true,
              minQuantity: 1,
              maxQuantity: 5,
            },
          ],
        },
      ]),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.listServices({
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toMatchObject({
      hotelId: "hotel-1",
      categories: [
        {
          id: "category-1",
          items: [
            { id: "item-1", effectivePrice: 100000, effectiveCurrency: "VND" },
            { id: "item-2", effectivePrice: 120000, effectiveCurrency: "VND" },
          ],
        },
      ],
    });
  });

  it("lists active services in one guest hotel category with a safe DTO", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      findActiveServiceCategoryWithItems: jest.fn().mockResolvedValue({
        total: 2,
        category: {
          id: "category-1",
          name: "Dining",
          description: "Food and drinks",
          defaultPrice: 100000,
          currency: "VND",
          items: [
            {
              id: "item-1",
              name: "Pho",
              description: "Noodles",
              priceOverride: null,
              quantityEnabled: false,
              minQuantity: 1,
              maxQuantity: null,
            },
            {
              id: "item-2",
              name: "Coffee",
              description: null,
              priceOverride: 45000,
              quantityEnabled: true,
              minQuantity: 1,
              maxQuantity: 5,
            },
          ],
        },
      }),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.listCategoryServices(
        {
          sessionId: "session-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          stayId: "stay-1",
          status: GuestSessionStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 60_000),
        },
        "category-1",
        { page: 2, limit: 10 },
      ),
    ).resolves.toEqual({
      page: 2,
      limit: 10,
      total: 2,
      category: {
        id: "category-1",
        name: "Dining",
        description: "Food and drinks",
      },
      services: [
        {
          id: "item-1",
          name: "Pho",
          description: "Noodles",
          price: 100000,
          currency: "VND",
          quantityEnabled: false,
          minQuantity: 1,
          maxQuantity: null,
        },
        {
          id: "item-2",
          name: "Coffee",
          description: null,
          price: 45000,
          currency: "VND",
          quantityEnabled: true,
          minQuantity: 1,
          maxQuantity: 5,
        },
      ],
    });

    expect(repository.findActiveServiceCategoryWithItems).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      categoryId: "category-1",
      skip: 10,
      take: 10,
    });
  });

  it("returns 404 when the guest category is unavailable", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      findActiveServiceCategoryWithItems: jest.fn().mockResolvedValue(null),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.listCategoryServices(
        {
          sessionId: "session-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          stayId: "stay-1",
          status: GuestSessionStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 60_000),
        },
        "category-missing",
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates guest request from a selected service item with inferred type and title", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findActiveServiceItemInHotel: jest.fn().mockResolvedValue({
        id: "item-1",
        name: "Pho bo",
        quantityEnabled: false,
        minQuantity: 1,
        maxQuantity: null,
        category: {},
      }),
      createRequest: jest.fn().mockResolvedValue({
        id: "request-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        sessionId: "session-1",
        serviceItemId: "item-1",
        assignedToUserId: "staff-1",
        metadata: { internal: true },
        title: "Pho bo",
        description: "No onion please",
        status: GuestRequestStatus.CREATED,
        priority: "URGENT",
        quantity: 1,
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
        cancelledAt: null,
        serviceItem: { id: "item-1", name: "Pho bo" },
        events: [],
      }),
    };
    const service = new GuestOsService(repository as never);

    const response = await service.createRequest(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        serviceItemId: "item-1",
        description: "No onion please",
        priority: GuestRequestPriority.URGENT,
      },
    );

    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceItemId: "item-1",
        description: "No onion please",
        priority: GuestRequestPriority.URGENT,
      }),
    );
    expect(response).toEqual({
      id: "request-1",
      service: { id: "item-1", name: "Pho bo" },
      status: "PENDING",
      priority: "URGENT",
      quantity: 1,
      note: "No onion please",
      answer: null,
      createdAt,
    });
    expect(response).not.toHaveProperty("hotelId");
    expect(response).not.toHaveProperty("roomId");
    expect(response).not.toHaveProperty("stayId");
    expect(response).not.toHaveProperty("sessionId");
    expect(response).not.toHaveProperty("serviceItemId");
    expect(response).not.toHaveProperty("assignedToUserId");
    expect(response).not.toHaveProperty("metadata");
    expect(response).not.toHaveProperty("type");
    expect(response).not.toHaveProperty("title");
    expect(response).not.toHaveProperty("description");
    expect(response).not.toHaveProperty("updatedAt");
    expect(response).not.toHaveProperty("completedAt");
    expect(response).not.toHaveProperty("cancelledAt");
  });

  it("lists guest request history with only guest-facing fields", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      listRequests: jest.fn().mockResolvedValue([
        1,
        [
          {
            id: "request-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            stayId: "stay-1",
            sessionId: "session-1",
            serviceItemId: "item-1",
            assignedToUserId: "staff-1",
            metadata: { internal: true },
            title: "Extra toilet paper",
            description: "ok minh test ngay",
            status: GuestRequestStatus.CREATED,
            priority: GuestRequestPriority.URGENT,
            quantity: 1,
            createdAt,
            updatedAt: createdAt,
            completedAt: null,
            cancelledAt: null,
            serviceItem: {
              id: "item-1",
              name: "Extra toilet paper",
              priceOverride: new Prisma.Decimal(20000),
              category: {
                defaultPrice: new Prisma.Decimal(15000),
                currency: "VND",
              },
            },
            events: [{ note: "Your request has been completed" }],
          },
        ],
      ]),
    };
    const service = new GuestOsService(repository as never);

    const response = await service.listRequests(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      { page: 1, limit: 20 },
    );

    expect(response).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      items: [
        {
          id: "request-1",
          displayName: "Extra toilet paper",
          status: "CREATED",
          priority: "URGENT",
          quantity: 1,
          currency: "VND",
          unitPrice: new Prisma.Decimal(20000),
          estimatedTotalAmount: new Prisma.Decimal(20000),
          service: {
            id: "item-1",
            name: "Extra toilet paper",
            price: new Prisma.Decimal(20000),
            currency: "VND",
          },
          description: "ok minh test ngay",
          answer: "Your request has been completed",
          createdAt: "2026-06-21T09:47:17.042Z",
          canCancel: true,
        },
      ],
    });
    expect(repository.listRequests).toHaveBeenCalledWith({ stayId: "stay-1" }, 0, 20);
    expect(response.items[0]).not.toHaveProperty("hotelId");
    expect(response.items[0]).not.toHaveProperty("roomId");
    expect(response.items[0]).not.toHaveProperty("stayId");
    expect(response.items[0]).not.toHaveProperty("sessionId");
    expect(response.items[0]).not.toHaveProperty("serviceItemId");
    expect(response.items[0]).not.toHaveProperty("assignedToUserId");
    expect(response.items[0]).not.toHaveProperty("metadata");
    expect(response.items[0]).not.toHaveProperty("type");
    expect(response.items[0]).not.toHaveProperty("title");
    expect(response.items[0]).not.toHaveProperty("note");
    expect(response.items[0]).not.toHaveProperty("updatedAt");
    expect(response.items[0]).not.toHaveProperty("completedAt");
    expect(response.items[0]).not.toHaveProperty("cancelledAt");
    expect(response.items[0]).not.toHaveProperty("events");
  });

  it("maps internal request statuses to guest-facing statuses", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      listRequests: jest.fn().mockResolvedValue([
        6,
        [
          GuestRequestStatus.CREATED,
          GuestRequestStatus.ACKNOWLEDGED,
          GuestRequestStatus.IN_PROGRESS,
          GuestRequestStatus.COMPLETED,
          GuestRequestStatus.CANCELLED,
          GuestRequestStatus.FAILED,
        ].map((status, index) => ({
          id: `request-${index + 1}`,
          title: `Request ${index + 1}`,
          description: null,
          status,
          priority: GuestRequestPriority.NORMAL,
          quantity: 1,
          createdAt,
          serviceItem: null,
          events: [],
        })),
      ]),
    };
    const service = new GuestOsService(repository as never);

    const response = await service.listRequests(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {},
    );

    expect(response.items.map((item) => item.status)).toEqual([
      "PENDING",
      "PENDING",
      "PENDING",
      "COMPLETED",
      "CANCELLED",
      "FAILED",
    ]);
  });

  it("exposes guest cancellation availability from internal request status", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      listRequests: jest.fn().mockResolvedValue([
        4,
        [
          GuestRequestStatus.CREATED,
          GuestRequestStatus.ACKNOWLEDGED,
          GuestRequestStatus.IN_PROGRESS,
          GuestRequestStatus.COMPLETED,
        ].map((status, index) => ({
          id: `request-${index + 1}`,
          title: `Request ${index + 1}`,
          description: null,
          status,
          priority: GuestRequestPriority.NORMAL,
          quantity: 1,
          createdAt,
          serviceItem: null,
          events: [],
        })),
      ]),
    };
    const service = new GuestOsService(repository as never);

    const response = await service.listRequests(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {},
    );

    expect(response.items.map((item) => item.canCancel)).toEqual([true, false, false, false]);
  });

  it("filters guest requests by service name, title, or description search", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      listRequests: jest.fn().mockResolvedValue([0, []]),
    };
    const service = new GuestOsService(repository as never);

    await service.listRequests(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        page: 2,
        limit: 10,
        status: "PENDING",
        priority: "URGENT",
        id: "  request-1  ",
        search: "  pillow  ",
      },
    );

    expect(repository.listRequests).toHaveBeenCalledWith(
      {
        stayId: "stay-1",
        id: "request-1",
        status: {
          in: [
            GuestRequestStatus.CREATED,
            GuestRequestStatus.ACKNOWLEDGED,
            GuestRequestStatus.IN_PROGRESS,
          ],
        },
        priority: {
          in: [GuestRequestPriority.URGENT],
        },
        OR: [
          { serviceItem: { is: { name: { contains: "pillow", mode: "insensitive" } } } },
          { title: { contains: "pillow", mode: "insensitive" } },
          { description: { contains: "pillow", mode: "insensitive" } },
        ],
      },
      10,
      10,
    );
  });

  it.each([
    ["CREATED", [GuestRequestStatus.CREATED]],
    ["CREATE", [GuestRequestStatus.CREATED]],
    ["IN_PROGRESS", [GuestRequestStatus.IN_PROGRESS]],
  ] as const)("filters guest requests by concrete status %s", async (status, expectedStatuses) => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, nextStatus) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: nextStatus,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      listRequests: jest.fn().mockResolvedValue([0, []]),
    };
    const service = new GuestOsService(repository as never);

    await service.listRequests(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      { status },
    );

    expect(repository.listRequests).toHaveBeenCalledWith(
      {
        stayId: "stay-1",
        status: { in: expectedStatuses },
      },
      0,
      20,
    );
  });

  it("maps legacy details to request description", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findActiveServiceItemInHotel: jest.fn().mockResolvedValue({
        id: "item-1",
        name: "Extra pillows",
        quantityEnabled: false,
        minQuantity: 1,
        maxQuantity: null,
        category: {},
      }),
      createRequest: jest.fn().mockResolvedValue({ id: "request-1" }),
    };
    const service = new GuestOsService(repository as never);

    await service.createRequest(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        serviceItemId: "item-1",
        details: "Extra pillows, please",
      },
    );

    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceItemId: "item-1",
        description: "Extra pillows, please",
      }),
    );
  });

  it("stores submitted quantity for quantity-enabled service items", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findActiveServiceItemInHotel: jest.fn().mockResolvedValue({
        id: "item-1",
        name: "Extra toilet paper",
        quantityEnabled: true,
        minQuantity: 1,
        maxQuantity: 5,
        category: {},
      }),
      createRequest: jest.fn().mockResolvedValue({ id: "request-1" }),
    };
    const service = new GuestOsService(repository as never);

    await service.createRequest(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        serviceItemId: "item-1",
        quantity: 3,
      },
    );

    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceItemId: "item-1",
        quantity: 3,
      }),
    );
  });

  it("forces quantity to one for service items without quantity support", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findActiveServiceItemInHotel: jest.fn().mockResolvedValue({
        id: "item-1",
        name: "Room cleaning",
        quantityEnabled: false,
        minQuantity: 1,
        maxQuantity: null,
        category: {},
      }),
      createRequest: jest.fn().mockResolvedValue({ id: "request-1" }),
    };
    const service = new GuestOsService(repository as never);

    await service.createRequest(
      {
        sessionId: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        serviceItemId: "item-1",
        quantity: 99,
      },
    );

    expect(repository.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceItemId: "item-1",
        quantity: 1,
      }),
    );
  });

  it("rejects missing or out-of-range quantities for quantity-enabled service items", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findActiveServiceItemInHotel: jest.fn().mockResolvedValue({
        id: "item-1",
        name: "Extra toilet paper",
        quantityEnabled: true,
        minQuantity: 1,
        maxQuantity: 5,
        category: {},
      }),
      createRequest: jest.fn().mockResolvedValue({ id: "request-1" }),
    };
    const service = new GuestOsService(repository as never);
    const context = {
      sessionId: "session-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      stayId: "stay-1",
      status: GuestSessionStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 60_000),
    };

    await expect(
      service.createRequest(context, { serviceItemId: "item-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createRequest(context, { serviceItemId: "item-1", quantity: 6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it("rejects unavailable service items when creating guest requests", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findActiveServiceItemInHotel: jest.fn().mockResolvedValue(null),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.createRequest(
        {
          sessionId: "session-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          stayId: "stay-1",
          status: GuestSessionStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 60_000),
        },
        { serviceItemId: "item-1" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows guests to cancel their own request while it is CREATED", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findRequestForGuest: jest.fn().mockResolvedValue({
        id: "request-1",
        status: GuestRequestStatus.CREATED,
      }),
      cancelCreatedRequest: jest.fn().mockResolvedValue({
        id: "request-1",
        title: "Extra towels",
        description: "Please cancel",
        status: GuestRequestStatus.CANCELLED,
        priority: GuestRequestPriority.NORMAL,
        quantity: 1,
        createdAt,
        serviceItem: null,
        events: [],
      }),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.cancelRequest(
        {
          sessionId: "session-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          stayId: "stay-1",
          status: GuestSessionStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 60_000),
        },
        " request-1 ",
      ),
    ).resolves.toEqual({
      id: "request-1",
      service: { id: null, name: "Extra towels" },
      status: "CANCELLED",
      priority: "NORMAL",
      quantity: 1,
      note: "Please cancel",
      answer: null,
      createdAt,
    });

    expect(repository.findRequestForGuest).toHaveBeenCalledWith("request-1", "stay-1");
    expect(repository.cancelCreatedRequest).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      stayId: "stay-1",
      sessionId: "session-1",
      requestId: "request-1",
    });
  });

  it("rejects guest cancellation after a request leaves CREATED", async () => {
    const repository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: "session-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status: GuestSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        stay: { status: "ACTIVE" },
        room: { status: "OCCUPIED" },
        hotel: { tenantId: "tenant-1" },
      }),
      updateSessionHeartbeat: jest.fn().mockImplementation((sessionId, status) => ({
        id: sessionId,
        hotelId: "hotel-1",
        roomId: "room-1",
        stayId: "stay-1",
        status,
        expiresAt: new Date(Date.now() + 60_000),
        hotel: { tenantId: "tenant-1" },
      })),
      findRequestForGuest: jest.fn().mockResolvedValue({
        id: "request-1",
        status: GuestRequestStatus.ACKNOWLEDGED,
      }),
      cancelCreatedRequest: jest.fn(),
    };
    const service = new GuestOsService(repository as never);

    await expect(
      service.cancelRequest(
        {
          sessionId: "session-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          stayId: "stay-1",
          status: GuestSessionStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 60_000),
        },
        "request-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.cancelCreatedRequest).not.toHaveBeenCalled();
  });
});
