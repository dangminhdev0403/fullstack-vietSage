import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  CategoryPriceUpdateMode,
  GuestRequestPriority,
  GuestRequestStatus,
  RoomQRCodeStatus,
  ServiceCatalogStatus,
} from "@prisma/client";
import { HotelsService } from "../hotels.service";

function createRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    findActorById: jest.fn().mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "HOTEL_MANAGER" } }],
      tenantUsers: [{ tenantId: "tenant-1" }],
    }),
    findHotelById: jest.fn().mockResolvedValue({
      id: "hotel-1",
      tenantId: "tenant-1",
      name: "Hotel",
      code: "hotel",
    }),
    findServiceCategoryInHotel: jest.fn().mockResolvedValue({ id: "category-1" }),
    findServiceItemInHotel: jest.fn().mockResolvedValue({ id: "item-1" }),
    findTenantById: jest.fn().mockResolvedValue({ id: "tenant-1" }),
    createHotel: jest.fn().mockImplementation((input) => ({
      id: "hotel-1",
      tenantId: input.tenant.connect.id,
      tenant: { id: input.tenant.connect.id },
      ...input,
    })),
    createRoomWithQr: jest.fn().mockImplementation((input) => ({
      id: "room-1",
      hotelId: input.hotelId,
      code: input.code,
      roomNumber: input.roomNumber,
      floor: input.floor,
      type: input.type,
      price: input.price,
      status: "AVAILABLE",
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      qrCodes: [],
      guestStays: [],
    })),
    listHotels: jest.fn().mockResolvedValue([0, []]),
    updateRoomInHotel: jest.fn().mockImplementation((_hotelId, roomId, data) => ({
      id: roomId,
      hotelId: "hotel-1",
      code: "VSH_ROOM_0001",
      roomNumber: data.roomNumber ?? "101",
      floor: data.floor ?? "1",
      type: data.type ?? "Deluxe",
      price: data.price ?? 900000,
      status: data.status ?? "AVAILABLE",
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      qrCodes: [],
      guestStays: [],
    })),
    findRoomInHotel: jest.fn().mockResolvedValue({
      id: "room-1",
      hotelId: "hotel-1",
      status: "AVAILABLE",
    }),
    rotateQr: jest.fn().mockImplementation((input) => ({
      id: "qr-1",
      hotelId: input.hotelId,
      roomId: input.roomId,
      publicCode: input.publicCode,
      status: RoomQRCodeStatus.INACTIVE,
      version: 2,
      activatedAt: null,
      deactivatedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    })),
    createStay: jest.fn().mockImplementation(async (input) => ({
      id: "stay-1",
      hotelId: input.hotelId,
      roomId: input.roomId,
      reservationCode: await input.generateReservationCode({ $transaction: "tx" }),
      guestDisplayName: input.guestDisplayName,
      guestPhone: input.guestPhone ?? null,
      status: "RESERVED",
      plannedCheckInAt: input.plannedCheckInAt,
      plannedCheckOutAt: input.plannedCheckOutAt,
      checkedInAt: null,
      activatedAt: null,
      checkedOutAt: null,
      accessCodeExpiresAt: null,
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    })),
    updateHotel: jest.fn().mockImplementation((hotelId, data) => ({
      id: hotelId,
      tenantId: "tenant-1",
      tenant: { id: "tenant-1" },
      name: data.name ?? "Hotel",
      code: "hotel",
      timezone: data.timezone ?? "Asia/Saigon",
      brandSettings: data.brandSettings,
      status: data.status ?? "ACTIVE",
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    })),
    createServiceCategory: jest.fn().mockImplementation((input) => ({
      id: "category-1",
      description: null,
      defaultPrice: input.defaultPrice,
      currency: input.currency ?? "VND",
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? ServiceCatalogStatus.ACTIVE,
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      ...input,
    })),
    updateServiceCategory: jest.fn().mockImplementation((input) => ({
      id: input.categoryId,
      hotelId: input.hotelId,
      ...input.data,
    })),
    createServiceItem: jest.fn().mockImplementation((input) => ({
      ...input,
      id: "item-1",
      description: input.description ?? null,
      priceOverride: input.priceOverride ?? null,
      metadata: input.metadata ?? null,
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? ServiceCatalogStatus.ACTIVE,
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      category: {
        id: input.categoryId,
        name: "Dining",
        status: ServiceCatalogStatus.ACTIVE,
        defaultPrice: 100000,
        currency: "VND",
      },
    })),
    listServiceCategories: jest.fn().mockResolvedValue([1, [{ id: "category-1" }]]),
    listRequests: jest.fn().mockResolvedValue([0, []]),
    summarizeRequests: jest.fn().mockResolvedValue({ total: 0, statuses: [] }),
    listServiceItems: jest.fn().mockResolvedValue([
      1,
      [
        {
          id: "item-1",
          hotelId: "hotel-1",
          categoryId: "category-1",
          name: "Pho",
          description: null,
          priceOverride: null,
          metadata: null,
          sortOrder: 0,
          status: ServiceCatalogStatus.ACTIVE,
          createdAt: new Date("2026-06-04T00:00:00.000Z"),
          updatedAt: new Date("2026-06-04T00:00:00.000Z"),
          category: {
            id: "category-1",
            name: "Dining",
            status: ServiceCatalogStatus.ACTIVE,
            defaultPrice: 100000,
            currency: "VND",
          },
        },
      ],
    ]),
    findRequestInHotel: jest.fn().mockResolvedValue({
      id: "request-1",
      hotelId: "hotel-1",
      status: GuestRequestStatus.CREATED,
    }),
    findRequestDetailInHotel: jest.fn().mockResolvedValue({ id: "request-1", events: [] }),
    findAssignableStaffInTenant: jest.fn().mockResolvedValue({ id: "staff-1" }),
    updateRequestAssignment: jest.fn().mockImplementation((input) => ({
      id: input.requestId,
      hotelId: input.hotelId,
      roomId: "room-1",
      stayId: "stay-1",
      sessionId: null,
      serviceItemId: null,
      assignedToUserId: input.assignedToUserId,
      status: GuestRequestStatus.CREATED,
      priority: GuestRequestPriority.NORMAL,
      title: "Request",
      description: null,
      metadata: null,
      quantity: 1,
      createdAt: new Date("2026-06-21T09:47:17.042Z"),
      updatedAt: new Date("2026-06-21T09:47:17.042Z"),
      completedAt: null,
      cancelledAt: null,
      room: { id: "room-1", roomNumber: "402" },
      stay: { id: "stay-1", reservationCode: "RSV-1", guestDisplayName: "Jane Guest" },
      assignedTo: null,
      serviceItem: null,
      session: null,
      events: [],
    })),
    createRequestEvent: jest.fn().mockImplementation((input) => ({ id: "event-1", ...input })),
    updateRequestStatus: jest
      .fn()
      .mockImplementation((input) => ({ id: input.requestId, ...input })),
    ...overrides,
  };
}

function createCodesService(overrides: Record<string, jest.Mock> = {}) {
  return {
    generateEntityCode: jest.fn().mockResolvedValue("VSH_HOTEL_0001"),
    ...overrides,
  };
}

function createAccessService(repository: ReturnType<typeof createRepository>, overrides = {}) {
  const actor = {
    userId: "actor-1",
    roleCodes: new Set(["HOTEL_MANAGER"]),
    tenantIds: new Set(["tenant-1"]),
    isSuperAdmin: false,
    isTenantOwner: false,
  };

  return {
    loadActorContext: jest.fn().mockResolvedValue(actor),
    rejectTenantOwnerTenantHint: jest.fn(),
    resolveTenantId: jest.fn().mockImplementation(async (_actor, tenantHint?: string) => {
      if (tenantHint) {
        return tenantHint;
      }

      return "tenant-1";
    }),
    assertTenantExists: jest.fn().mockResolvedValue(undefined),
    assertHotelAccess: jest
      .fn()
      .mockImplementation(async (_actorUserId: string, hotelId: string) => {
        const hotel = await repository.findHotelById(hotelId);
        if (!hotel) {
          throw new NotFoundException("Không tìm thấy khách sạn");
        }

        if (hotel.tenantId !== "tenant-1") {
          throw new ForbiddenException("Bạn không thể truy cập khách sạn này");
        }

        return hotel;
      }),
    ...overrides,
  };
}

function createService(
  repository: ReturnType<typeof createRepository>,
  codesService = createCodesService(),
  accessService = createAccessService(repository),
) {
  return new HotelsService(repository as never, codesService as never, accessService as never);
}

describe("HotelsService", () => {
  it("tạo khách sạn với mã được sinh tự động", async () => {
    const repository = createRepository();
    const codesService = createCodesService();
    const service = createService(repository, codesService);

    await service.createHotel("actor-1", {
      tenantId: "tenant-1",
      name: "Riverside Hotel",
    });

    expect(codesService.generateEntityCode).toHaveBeenCalledWith("HOTEL");
    expect(repository.createHotel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Riverside Hotel",
        code: "VSH_HOTEL_0001",
      }),
    );
  });

  it("lấy chi tiết khách sạn khi người thực hiện có quyền truy cập", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(service.getHotel("actor-1", "hotel-1")).resolves.toMatchObject({
      id: "hotel-1",
      tenantId: "tenant-1",
      code: "hotel",
    });
  });

  it("cập nhật các trường hồ sơ khách sạn mà không thay đổi mã đã sinh", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.updateHotel("actor-1", "hotel-1", {
      name: " Riverside Hotel ",
      timezone: "Asia/Saigon",
      brandSettings: null,
    });

    expect(repository.updateHotel).toHaveBeenCalledWith("hotel-1", {
      name: "Riverside Hotel",
      timezone: "Asia/Saigon",
      brandSettings: expect.any(Object),
      status: undefined,
    });
  });

  it("không lọc danh sách khách sạn của super admin theo tenant khi không truyền tenantId", async () => {
    const repository = createRepository({
      findActorById: jest.fn().mockResolvedValue({
        id: "actor-1",
        userRoles: [{ role: { code: "SUPER_ADMIN" } }],
        tenantUsers: [{ tenantId: "root-tenant" }],
      }),
    });
    const accessService = createAccessService(repository, {
      loadActorContext: jest.fn().mockResolvedValue({
        userId: "actor-1",
        roleCodes: new Set(["SUPER_ADMIN"]),
        tenantIds: new Set(["root-tenant"]),
        isSuperAdmin: true,
        isTenantOwner: false,
      }),
    });
    const service = createService(repository, createCodesService(), accessService);

    await service.listHotels("actor-1", { limit: 100 });

    expect(repository.listHotels).toHaveBeenCalledWith({ status: "ACTIVE" }, 0, 100);
  });

  it("tạo danh mục dịch vụ trong khách sạn có thể truy cập", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createServiceCategory("actor-1", "hotel-1", {
        name: "Dining",
        defaultPrice: 100000,
        sortOrder: 1,
      }),
    ).resolves.toMatchObject({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      name: "Dining",
      defaultPrice: 100000,
      sortOrder: 1,
    });
  });

  it("chặn quản lý khách sạn ngoài tenant của người thực hiện", async () => {
    const repository = createRepository({
      findHotelById: jest.fn().mockResolvedValue({ id: "hotel-2", tenantId: "tenant-2" }),
    });
    const service = createService(repository);

    await expect(service.listServiceCategories("actor-1", "hotel-2", {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("yêu cầu danh mục của dịch vụ phải thuộc về khách sạn", async () => {
    const repository = createRepository({
      findServiceCategoryInHotel: jest.fn().mockResolvedValue(null),
    });
    const service = createService(repository);

    await expect(
      service.createServiceItem("actor-1", "hotel-1", {
        categoryId: "missing-category",
        name: "Room cleanup",
        status: ServiceCatalogStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("cập nhật phân công yêu cầu và thêm sự kiện của nhân sự", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.updateRequestAssignment("actor-1", "hotel-1", "request-1", {
      assignedToUserId: "staff-1",
      note: "Taking this",
    });

    expect(repository.findAssignableStaffInTenant).toHaveBeenCalledWith("staff-1", "tenant-1");
    expect(repository.updateRequestAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        requestId: "request-1",
        actorUserId: "actor-1",
        assignedToUserId: "staff-1",
        note: "Taking this",
        tenantId: "tenant-1",
      }),
    );
  });

  it("từ chối phân công cho người dùng ngoài tenant của khách sạn", async () => {
    const repository = createRepository({
      findAssignableStaffInTenant: jest.fn().mockResolvedValue(null),
    });
    const service = createService(repository);

    await expect(
      service.updateRequestAssignment("actor-1", "hotel-1", "request-1", {
        assignedToUserId: "staff-2",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps staff request list to frontend DTOs without raw Prisma fields or events", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const updatedAt = new Date("2026-06-21T10:00:00.000Z");
    const repository = createRepository({
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
            status: GuestRequestStatus.CREATED,
            priority: GuestRequestPriority.URGENT,
            title: "Extra towels",
            description: "Two towels please",
            metadata: { internal: true },
            quantity: 2,
            createdAt,
            updatedAt,
            completedAt: null,
            cancelledAt: null,
            room: { id: "room-1", roomNumber: "402" },
            stay: {
              id: "stay-1",
              reservationCode: "RSV-1",
              guestDisplayName: "Jane Guest",
            },
            assignedTo: {
              id: "staff-1",
              fullName: "Minh Staff",
              email: "minh@example.com",
            },
            serviceItem: {
              id: "item-1",
              name: "Extra towels",
              priceOverride: null,
              category: {
                id: "category-1",
                name: "Housekeeping",
                defaultPrice: 0,
                currency: "VND",
              },
            },
            events: [{ note: "We received your request" }],
          },
        ],
      ]),
    });
    const service = createService(repository);

    const response = await service.listRequests("actor-1", "hotel-1", { page: 1, limit: 20 });

    const expectedItem = {
      id: "request-1",
      displayName: "Extra towels",
      status: GuestRequestStatus.CREATED,
      priority: GuestRequestPriority.URGENT,
      quantity: 2,
      description: "Two towels please",
      latestNote: "We received your request",
      createdAt: "2026-06-21T09:47:17.042Z",
      roomNumber: "402",
      guestName: "Jane Guest",
      categoryName: "Housekeeping",
      assignedToName: "Minh Staff",
      actions: ["ACCEPT", "CANCEL"],
    };

    expect(response).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      items: [expectedItem],
      groups: {
        active: { total: 1, items: [expectedItem] },
        completed: { total: 0, items: [] },
      },
    });
    expect(response.items[0]).not.toHaveProperty("hotelId");
    expect(response.items[0]).not.toHaveProperty("roomId");
    expect(response.items[0]).not.toHaveProperty("stayId");
    expect(response.items[0]).not.toHaveProperty("sessionId");
    expect(response.items[0]).not.toHaveProperty("type");
    expect(response.items[0]).not.toHaveProperty("metadata");
    expect(response.items[0]).not.toHaveProperty("serviceItemId");
    expect(response.items[0]).not.toHaveProperty("assignedToUserId");
    expect(response.items[0]).not.toHaveProperty("completedAt");
    expect(response.items[0]).not.toHaveProperty("cancelledAt");
    expect(response.items[0]).not.toHaveProperty("events");
    expect(response.items[0]).not.toHaveProperty("updatedAt");
    expect(response.items[0]).not.toHaveProperty("room");
    expect(response.items[0]).not.toHaveProperty("guest");
    expect(response.items[0]).not.toHaveProperty("service");
    expect(response.items[0]).not.toHaveProperty("assignedTo");
    expect(response.items[0]).not.toHaveProperty("canAccept");
    expect(response.items[0]).not.toHaveProperty("canStart");
    expect(response.items[0]).not.toHaveProperty("canComplete");
    expect(response.items[0]).not.toHaveProperty("canCancel");
    expect(response.items[0]).not.toHaveProperty("canFail");
  });

  it("filters staff request list by room number", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.listRequests("actor-1", "hotel-1", { roomNumber: "402" });

    expect(repository.listRequests).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        room: { is: { roomNumber: "402" } },
        status: {
          in: [
            GuestRequestStatus.CREATED,
            GuestRequestStatus.ACKNOWLEDGED,
            GuestRequestStatus.IN_PROGRESS,
          ],
        },
      },
      0,
      20,
    );
  });

  it("filters staff request list by priority", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.listRequests("actor-1", "hotel-1", { priority: GuestRequestPriority.URGENT });

    expect(repository.listRequests).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        priority: {
          in: [GuestRequestPriority.URGENT],
        },
        status: {
          in: [
            GuestRequestStatus.CREATED,
            GuestRequestStatus.ACKNOWLEDGED,
            GuestRequestStatus.IN_PROGRESS,
          ],
        },
      },
      0,
      20,
    );
  });

  it("maps staff request list actions from request status", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = createRepository({
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
          status,
          priority: GuestRequestPriority.NORMAL,
          title: `Request ${index + 1}`,
          description: null,
          quantity: 1,
          createdAt,
          updatedAt: createdAt,
          room: { id: "room-1", roomNumber: "402" },
          stay: { id: "stay-1", reservationCode: "RSV-1", guestDisplayName: "Jane Guest" },
          assignedTo: null,
          serviceItem: null,
          events: [],
        })),
      ]),
    });
    const service = createService(repository);

    const response = await service.listRequests("actor-1", "hotel-1", {});

    expect(response.items.map((item) => item.actions)).toEqual([
      ["ACCEPT", "CANCEL"],
      ["START", "CANCEL"],
      ["COMPLETE", "FAIL"],
      [],
      [],
      [],
    ]);
  });

  it("returns only product-supported staff request priority values", async () => {
    const createdAt = new Date("2026-06-21T09:47:17.042Z");
    const repository = createRepository({
      listRequests: jest.fn().mockResolvedValue([
        2,
        [GuestRequestPriority.NORMAL, GuestRequestPriority.URGENT].map((priority, index) => ({
          id: `request-${index + 1}`,
          status: GuestRequestStatus.CREATED,
          priority,
          title: `Request ${index + 1}`,
          description: null,
          quantity: 1,
          createdAt,
          updatedAt: createdAt,
          room: { id: "room-1", roomNumber: "402" },
          stay: { id: "stay-1", reservationCode: "RSV-1", guestDisplayName: "Jane Guest" },
          assignedTo: null,
          serviceItem: null,
          events: [],
        })),
      ]),
    });
    const service = createService(repository);

    const response = await service.listRequests("actor-1", "hotel-1", {});

    expect(response.items.map((item) => item.priority)).toEqual(["NORMAL", "URGENT"]);
  });

  it("summarizes staff requests by status with filters and zero-filled statuses", async () => {
    const repository = createRepository({
      summarizeRequests: jest.fn().mockResolvedValue({
        total: 5,
        statuses: [
          { status: GuestRequestStatus.CREATED, _count: { _all: 4 } },
          { status: GuestRequestStatus.CANCELLED, _count: { _all: 1 } },
        ],
      }),
    });
    const service = createService(repository);

    await expect(
      service.getRequestsSummary("actor-1", "hotel-1", {
        roomNumber: "402",
        serviceItemId: "item-1",
        assignedToUserId: "staff-1",
      }),
    ).resolves.toEqual({
      total: 5,
      statuses: {
        CREATED: 4,
        ACKNOWLEDGED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 1,
        FAILED: 0,
      },
    });
    expect(repository.summarizeRequests).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      room: { is: { roomNumber: "402" } },
      serviceItemId: "item-1",
      assignedToUserId: "staff-1",
    });
  });

  it("giới hạn danh sách khách sạn của TENANT_OWNER theo tất cả thành viên tenant đang hoạt động", async () => {
    const repository = createRepository();
    const accessService = createAccessService(repository, {
      loadActorContext: jest.fn().mockResolvedValue({
        userId: "actor-1",
        roleCodes: new Set(["TENANT_OWNER"]),
        tenantIds: new Set(["tenant-1", "tenant-2"]),
        isSuperAdmin: false,
        isTenantOwner: true,
      }),
    });
    const service = createService(repository, createCodesService(), accessService);

    await service.listHotels("actor-1", { page: 1, limit: 20 });

    expect(repository.listHotels).toHaveBeenCalledWith(
      { tenantId: { in: ["tenant-1", "tenant-2"] }, status: "ACTIVE" },
      0,
      20,
    );
  });

  it("rejects TENANT_OWNER tenant hints on hotel list", async () => {
    const repository = createRepository();
    const accessService = createAccessService(repository, {
      loadActorContext: jest.fn().mockResolvedValue({
        userId: "actor-1",
        roleCodes: new Set(["TENANT_OWNER"]),
        tenantIds: new Set(["tenant-1"]),
        isSuperAdmin: false,
        isTenantOwner: true,
      }),
      rejectTenantOwnerTenantHint: jest.fn().mockImplementation(() => {
        throw new BadRequestException("Không chấp nhận tenantId trong yêu cầu của TENANT_OWNER");
      }),
    });
    const service = createService(repository, createCodesService(), accessService);

    await expect(service.listHotels("actor-1", { tenantId: "tenant-1" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("trả về 403 khi TENANT_OWNER tạo khách sạn", async () => {
    const repository = createRepository();
    const accessService = createAccessService(repository, {
      loadActorContext: jest.fn().mockResolvedValue({
        userId: "actor-1",
        roleCodes: new Set(["TENANT_OWNER"]),
        tenantIds: new Set(["tenant-1"]),
        isSuperAdmin: false,
        isTenantOwner: true,
      }),
      resolveTenantId: jest
        .fn()
        .mockRejectedValue(new ForbiddenException("TENANT_OWNER không thể tạo khách sạn")),
    });
    const service = createService(repository, createCodesService(), accessService);

    await expect(
      service.createHotel("actor-1", { name: "Riverside Hotel" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("cập nhật khách sạn của TENANT_OWNER bằng thao tác trong phạm vi tenant", async () => {
    const repository = createRepository({
      updateHotelScoped: jest.fn().mockResolvedValue({
        id: "hotel-1",
        tenantId: "tenant-2",
        tenant: { id: "tenant-2" },
        name: "Updated Hotel",
        code: "hotel",
        timezone: "Asia/Saigon",
        brandSettings: null,
        status: "ACTIVE",
        createdAt: new Date("2026-06-04T00:00:00.000Z"),
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      }),
    });
    const accessService = createAccessService(repository, {
      loadActorContext: jest.fn().mockResolvedValue({
        userId: "actor-1",
        roleCodes: new Set(["TENANT_OWNER"]),
        tenantIds: new Set(["tenant-1", "tenant-2"]),
        isSuperAdmin: false,
        isTenantOwner: true,
      }),
      assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-2" }),
    });
    const service = createService(repository, createCodesService(), accessService);

    await service.updateHotel("actor-1", "hotel-1", { name: "Updated Hotel" });

    expect(repository.updateHotelScoped).toHaveBeenCalledWith(
      "hotel-1",
      ["tenant-1", "tenant-2"],
      expect.objectContaining({ name: "Updated Hotel" }),
    );
  });

  it("creates service items with effective category pricing", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createServiceItem("actor-1", "hotel-1", {
        categoryId: "category-1",
        name: "Pho",
      }),
    ).resolves.toMatchObject({
      id: "item-1",
      priceOverride: null,
      effectivePrice: 100000,
      effectiveCurrency: "VND",
      category: { id: "category-1", defaultPrice: 100000, currency: "VND" },
    });

    expect(repository.createServiceItem).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: "category-1",
        name: "Pho",
        priceOverride: undefined,
      }),
    );
  });

  it("uses service item override price when present", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createServiceItem("actor-1", "hotel-1", {
        categoryId: "category-1",
        name: "Pho",
        priceOverride: 120000,
      }),
    ).resolves.toMatchObject({
      priceOverride: 120000,
      effectivePrice: 120000,
      effectiveCurrency: "VND",
    });
  });

  it("keeps item overrides when category price update mode is CATEGORY_ONLY", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.updateServiceCategory("actor-1", "hotel-1", "category-1", {
      defaultPrice: 150000,
      priceUpdateMode: CategoryPriceUpdateMode.CATEGORY_ONLY,
    });

    expect(repository.updateServiceCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ defaultPrice: 150000 }),
        overrideAllItems: false,
        overridePrice: 150000,
      }),
    );
  });

  it("overwrites all item overrides when category price update mode is OVERRIDE_ALL_ITEMS", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.updateServiceCategory("actor-1", "hotel-1", "category-1", {
      defaultPrice: 150000,
      priceUpdateMode: CategoryPriceUpdateMode.OVERRIDE_ALL_ITEMS,
    });

    expect(repository.updateServiceCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ defaultPrice: 150000 }),
        overrideAllItems: true,
        overridePrice: 150000,
      }),
    );
  });

  it("creates a room with an auto-generated code", async () => {
    const repository = createRepository();
    const codesService = createCodesService({
      generateEntityCode: jest.fn().mockResolvedValue("VSH_ROOM_0001"),
    });
    const service = createService(repository, codesService);

    await expect(
      service.createRoom("actor-1", "hotel-1", {
        roomNumber: "101",
        floor: "1",
        type: "Deluxe",
        price: 1200000,
      }),
    ).resolves.toMatchObject({
      id: "room-1",
      code: "VSH_ROOM_0001",
      roomNumber: "101",
      price: 1200000,
    });

    expect(codesService.generateEntityCode).toHaveBeenCalledWith("ROOM");
    expect(repository.createRoomWithQr).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        code: "VSH_ROOM_0001",
        roomNumber: "101",
        price: 1200000,
      }),
    );
    expect(repository.createRoomWithQr.mock.calls[0][0].publicCode.startsWith("room_")).toBe(false);
  });

  it("creates a list of rooms with prices", async () => {
    const repository = createRepository();
    const codesService = createCodesService({
      generateEntityCode: jest
        .fn()
        .mockResolvedValueOnce("VSH_ROOM_0001")
        .mockResolvedValueOnce("VSH_ROOM_0002"),
    });
    const service = createService(repository, codesService);

    await expect(
      service.createRooms("actor-1", "hotel-1", {
        items: [
          { roomNumber: "101", floor: "1", type: "Deluxe", price: 1200000 },
          { roomNumber: "102", floor: "1", type: "Suite", price: 1500000 },
        ],
      }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        { roomNumber: "101", price: 1200000 },
        { roomNumber: "102", price: 1500000 },
      ],
    });

    expect(codesService.generateEntityCode).toHaveBeenCalledTimes(2);
    expect(repository.createRoomWithQr).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        hotelId: "hotel-1",
        code: "VSH_ROOM_0001",
        roomNumber: "101",
        price: 1200000,
      }),
    );
    expect(repository.createRoomWithQr.mock.calls[0][0].publicCode.startsWith("room_")).toBe(false);
    expect(repository.createRoomWithQr).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        hotelId: "hotel-1",
        code: "VSH_ROOM_0002",
        roomNumber: "102",
        price: 1500000,
      }),
    );
    expect(repository.createRoomWithQr.mock.calls[1][0].publicCode.startsWith("room_")).toBe(false);
  });

  it("rotates QR with a bare opaque token", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(service.rotateQr("actor-1", "hotel-1", "room-1", {})).resolves.toMatchObject({
      id: "qr-1",
      publicCode: expect.any(String),
    });

    expect(repository.rotateQr).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-1",
        publicCode: expect.any(String),
      }),
    );
    expect(repository.rotateQr.mock.calls[0][0].publicCode.startsWith("room_")).toBe(false);
  });

  it("creates a stay with a backend-generated reservation code", async () => {
    const repository = createRepository();
    const codesService = createCodesService({
      generateEntityCode: jest.fn().mockResolvedValue("VSH_RESERVATION_0001"),
    });
    const service = createService(repository, codesService);

    await expect(
      service.createStay("actor-1", "hotel-1", {
        roomId: "room-1",
        guestDisplayName: "Nguyen Van A",
        guestPhone: "0901234567",
        plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      id: "stay-1",
      reservationCode: "VSH_RESERVATION_0001",
      status: "RESERVED",
    });

    expect(repository.createStay).toHaveBeenCalledWith(
      expect.not.objectContaining({ reservationCode: expect.anything() }),
    );
    expect(codesService.generateEntityCode).toHaveBeenCalledWith(
      "RESERVATION",
      expect.objectContaining({ $transaction: "tx" }),
    );
  });

  it("updates room details with price", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.updateRoom("actor-1", "hotel-1", "room-1", {
        roomNumber: " 102 ",
        floor: "2",
        type: "Suite",
        price: 1500000,
      }),
    ).resolves.toMatchObject({
      id: "room-1",
      roomNumber: "102",
      price: 1500000,
    });

    expect(repository.updateRoomInHotel).toHaveBeenCalledWith(
      "hotel-1",
      "room-1",
      expect.objectContaining({
        roomNumber: "102",
        floor: "2",
        type: "Suite",
        price: 1500000,
      }),
    );
  });
});
