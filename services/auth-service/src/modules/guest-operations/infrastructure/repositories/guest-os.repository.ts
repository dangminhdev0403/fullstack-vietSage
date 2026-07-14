import { Injectable } from "@nestjs/common";
import {
  DomainEventStatus,
  GuestRequestActorType,
  GuestRequestStatus,
  GuestSessionStatus,
  GuestStayStatus,
  Prisma,
  RoomQRCodeStatus,
  RoomStatus,
  ServiceCatalogStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

export const guestSessionInclude = {
  hotel: {
    select: {
      id: true,
      tenantId: true,
      name: true,
      code: true,
      timezone: true,
      brandSettings: true,
    },
  },
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: true,
      type: true,
      status: true,
    },
  },
  stay: {
    select: {
      id: true,
      reservationCode: true,
      guestDisplayName: true,
      status: true,
      plannedCheckOutAt: true,
      checkedOutAt: true,
    },
  },
} satisfies Prisma.GuestSessionInclude;

export type GuestSessionContextRow = Prisma.GuestSessionGetPayload<{
  include: typeof guestSessionInclude;
}>;

export const guestRequestGuestInclude = {
  serviceItem: {
    select: {
      id: true,
      name: true,
      priceOverride: true,
      category: {
        select: {
          defaultPrice: true,
          currency: true,
        },
      },
    },
  },
  events: {
    where: {
      actorType: GuestRequestActorType.STAFF,
      note: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      note: true,
    },
  },
} satisfies Prisma.GuestRequestInclude;

export type GuestRequestGuestRow = Prisma.GuestRequestGetPayload<{
  include: typeof guestRequestGuestInclude;
}>;

@Injectable()
export class GuestOsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findQrForScan(publicCode: string) {
    return this.prisma.roomQRCode.findUnique({
      where: { publicCode },
      include: {
        hotel: {
          select: {
            id: true,
            tenantId: true,
            name: true,
            code: true,
            timezone: true,
            brandSettings: true,
          },
        },
        room: true,
      },
    });
  }

  async findActiveStayForRoom(hotelId: string, roomId: string) {
    return this.prisma.guestStay.findFirst({
      where: {
        hotelId,
        roomId,
        status: GuestStayStatus.ACTIVE,
      },
      orderBy: { activatedAt: "desc" },
    });
  }

  async createGuestSession(input: {
    hotelId: string;
    tenantId: string;
    roomId: string;
    stayId: string;
    roomQrCodeId: string;
    sessionTokenHash: string;
    deviceFingerprintHash?: string;
    ipHash?: string;
    userAgent?: string;
    expiresAt: Date;
    maxDistinctDevices?: number;
  }) {
    const now = new Date();
    const maxDistinctDevices = input.maxDistinctDevices ?? 5;

    return this.prisma.$transaction(async (tx) => {
      const sameDeviceSessions = await this.findActiveSessionsForSameDevice(tx, input);
      const sessionEventType =
        sameDeviceSessions.length > 0 ? "SESSION_ROTATED" : "NEW_DEVICE_SESSION";

      if (sameDeviceSessions.length > 0) {
        await this.revokeActiveSessionsForSameDevice(
          tx,
          sameDeviceSessions.map((session) => session.id),
          now,
        );
      } else {
        const distinctDeviceCount = await this.countDistinctActiveDevicesForStay(tx, input.stayId);
        if (distinctDeviceCount >= maxDistinctDevices) {
          await this.createDomainEvent(tx, {
            eventType: "DEVICE_LIMIT_REACHED",
            aggregateType: "GuestStay",
            aggregateId: input.stayId,
            hotelId: input.hotelId,
            tenantId: input.tenantId,
            payload: {
              stayId: input.stayId,
              roomId: input.roomId,
              maxDistinctDevices,
              distinctDeviceCount,
              hasDeviceFingerprint: Boolean(input.deviceFingerprintHash),
            },
          });
          throw new Error("GUEST_SESSION_LIMIT_REACHED");
        }
      }

      const session = await tx.guestSession.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          stayId: input.stayId,
          roomQrCodeId: input.roomQrCodeId,
          sessionTokenHash: input.sessionTokenHash,
          status: GuestSessionStatus.ACTIVE,
          deviceFingerprintHash: input.deviceFingerprintHash,
          ipHash: input.ipHash,
          userAgent: input.userAgent,
          activatedAt: now,
          lastSeenAt: now,
          expiresAt: input.expiresAt,
        },
        include: guestSessionInclude,
      });

      await this.createDomainEvent(tx, {
        eventType: "GUEST_SESSION_CREATED",
        aggregateType: "GuestSession",
        aggregateId: session.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { sessionId: session.id, stayId: input.stayId, roomId: input.roomId },
      });

      await this.createDomainEvent(tx, {
        eventType: sessionEventType,
        aggregateType: "GuestSession",
        aggregateId: session.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: {
          sessionId: session.id,
          stayId: input.stayId,
          roomId: input.roomId,
          replacedSessionIds: sameDeviceSessions.map((previous) => previous.id),
          matchStrategy: input.deviceFingerprintHash ? "DEVICE_FINGERPRINT" : "IP_USER_AGENT",
        },
      });

      if (sameDeviceSessions.length > 0) {
        await this.createDomainEvent(tx, {
          eventType: "SESSION_REUSED",
          aggregateType: "GuestStay",
          aggregateId: input.stayId,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: {
            stayId: input.stayId,
            roomId: input.roomId,
            sessionId: session.id,
            replacedSessionIds: sameDeviceSessions.map((previous) => previous.id),
          },
        });
      }

      return session;
    });
  }

  async findActiveSessionByStayAndDeviceFingerprint(stayId: string, deviceFingerprintHash: string) {
    return this.prisma.guestSession.findFirst({
      where: {
        stayId,
        deviceFingerprintHash,
        status: { in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] },
      },
      orderBy: { createdAt: "desc" },
      include: guestSessionInclude,
    });
  }

  async revokeActiveSessionsForDevice(stayId: string, deviceFingerprintHash: string) {
    return this.prisma.guestSession.updateMany({
      where: {
        stayId,
        deviceFingerprintHash,
        status: { in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] },
      },
      data: {
        status: GuestSessionStatus.CLOSED,
        closedAt: new Date(),
      },
    });
  }

  async countDistinctActiveDevices(stayId: string) {
    return this.countDistinctActiveDevicesForStay(this.prisma, stayId);
  }

  async recordQrScan(input: {
    eventType?: string;
    hotelId?: string;
    tenantId?: string;
    aggregateId: string;
    payload: Prisma.InputJsonValue;
  }) {
    return this.prisma.domainEvent.create({
      data: {
        eventType: input.eventType ?? "ROOM_QR_SCANNED",
        aggregateType: "RoomQRCode",
        aggregateId: input.aggregateId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: input.payload,
        status: DomainEventStatus.PENDING,
      },
    });
  }

  async findSessionByTokenHash(sessionTokenHash: string) {
    return this.prisma.guestSession.findUnique({
      where: { sessionTokenHash },
      include: guestSessionInclude,
    });
  }

  async findSessionById(sessionId: string) {
    return this.prisma.guestSession.findUnique({
      where: { id: sessionId },
      include: guestSessionInclude,
    });
  }

  async updateSessionHeartbeat(sessionId: string, status: GuestSessionStatus) {
    return this.prisma.guestSession.update({
      where: { id: sessionId },
      data: {
        status,
        lastSeenAt: new Date(),
        idleAt: status === GuestSessionStatus.IDLE ? new Date() : null,
      },
      include: guestSessionInclude,
    });
  }

  async closeSession(sessionId: string) {
    return this.prisma.guestSession.update({
      where: { id: sessionId },
      data: {
        status: GuestSessionStatus.CLOSED,
        closedAt: new Date(),
      },
      include: guestSessionInclude,
    });
  }

  async createRequest(input: {
    hotelId: string;
    tenantId: string;
    roomId: string;
    stayId: string;
    sessionId: string;
    serviceItemId: string;
    priority: Prisma.GuestRequestCreateInput["priority"];
    description?: string;
    quantity: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.guestRequest.create({
        data: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          stayId: input.stayId,
          sessionId: input.sessionId,
          serviceItemId: input.serviceItemId,
          priority: input.priority,
          description: input.description,
          quantity: input.quantity,
          metadata: input.metadata,
          status: GuestRequestStatus.CREATED,
        },
        include: guestRequestGuestInclude,
      });

      await tx.guestRequestEvent.create({
        data: {
          requestId: request.id,
          hotelId: input.hotelId,
          actorType: GuestRequestActorType.GUEST,
          sessionId: input.sessionId,
          eventType: "REQUEST_CREATED",
          toStatus: GuestRequestStatus.CREATED,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "REQUEST_CREATED",
        aggregateType: "GuestRequest",
        aggregateId: request.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { requestId: request.id, stayId: input.stayId, roomId: input.roomId },
      });

      return request;
    });
  }

  async listRequests(where: Prisma.GuestRequestWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.guestRequest.count({ where });
      const rows = await tx.guestRequest.findMany({
        where,
        include: guestRequestGuestInclude,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async findRequestForGuest(requestId: string, stayId: string) {
    return this.prisma.guestRequest.findFirst({
      where: { id: requestId, stayId },
      include: guestRequestGuestInclude,
    });
  }

  async cancelCreatedRequest(input: {
    hotelId: string;
    tenantId: string;
    stayId: string;
    sessionId: string;
    requestId: string;
    sourceStatus: GuestRequestStatus;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updateResult = await tx.guestRequest.updateMany({
        where: {
          id: input.requestId,
          hotelId: input.hotelId,
          stayId: input.stayId,
          status: input.sourceStatus,
        },
        data: {
          status: GuestRequestStatus.CANCELLED,
          cancelledAt: now,
        },
      });

      if (updateResult.count !== 1) {
        return null;
      }

      const request = await tx.guestRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        include: guestRequestGuestInclude,
      });

      await tx.guestRequestEvent.create({
        data: {
          requestId: input.requestId,
          hotelId: input.hotelId,
          actorType: GuestRequestActorType.GUEST,
          sessionId: input.sessionId,
          eventType: "REQUEST_CANCELLED",
          fromStatus: input.sourceStatus,
          toStatus: GuestRequestStatus.CANCELLED,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "REQUEST_CANCELLED",
        aggregateType: "GuestRequest",
        aggregateId: input.requestId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { requestId: input.requestId, stayId: input.stayId },
      });

      return request;
    });
  }

  async findActiveServiceItemInHotel(hotelId: string, serviceItemId: string) {
    return this.prisma.hotelServiceItem.findFirst({
      where: {
        id: serviceItemId,
        hotelId,
        status: ServiceCatalogStatus.ACTIVE,
        category: { status: ServiceCatalogStatus.ACTIVE },
      },
      include: {
        translations: true,
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            defaultPrice: true,
            currency: true,
            translations: true,
          },
        },
      },
    });
  }

  async listActiveServiceCatalog(hotelId: string) {
    return this.prisma.hotelServiceCategory.findMany({
      where: {
        hotelId,
        status: ServiceCatalogStatus.ACTIVE,
      },
      include: {
        translations: true,
        items: {
          where: { status: ServiceCatalogStatus.ACTIVE },
          include: { translations: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async findActiveServiceCategoryWithItems(input: {
    hotelId: string;
    categoryId: string;
    skip: number;
    take: number;
  }) {
    const category = await this.prisma.hotelServiceCategory.findFirst({
      where: {
        id: input.categoryId,
        hotelId: input.hotelId,
        status: ServiceCatalogStatus.ACTIVE,
      },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        translations: true,
        defaultPrice: true,
        currency: true,
        items: {
          where: {
            categoryId: input.categoryId,
            status: ServiceCatalogStatus.ACTIVE,
          },
          orderBy: [{ sortOrder: "asc" }],
          skip: input.skip,
          take: input.take,
          select: {
            id: true,
            name: true,
            description: true,
            translations: true,
            priceOverride: true,
            quantityEnabled: true,
            minQuantity: true,
            maxQuantity: true,
          },
        },
      },
    });

    if (!category) {
      return null;
    }

    const total = await this.prisma.hotelServiceItem.count({
      where: {
        hotelId: input.hotelId,
        categoryId: input.categoryId,
        status: ServiceCatalogStatus.ACTIVE,
      },
    });

    return { category, total };
  }

  isAccessOpen(input: {
    qrStatus: RoomQRCodeStatus;
    roomStatus: RoomStatus;
    stayStatus: GuestStayStatus;
  }) {
    return (
      input.qrStatus === RoomQRCodeStatus.ACTIVE &&
      input.roomStatus === RoomStatus.OCCUPIED &&
      input.stayStatus === GuestStayStatus.ACTIVE
    );
  }

  private async findActiveSessionsForSameDevice(
    tx: Prisma.TransactionClient,
    input: { stayId: string; deviceFingerprintHash?: string; ipHash?: string; userAgent?: string },
  ) {
    const activeStatus = { in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] };

    if (input.deviceFingerprintHash) {
      return tx.guestSession.findMany({
        where: {
          stayId: input.stayId,
          deviceFingerprintHash: input.deviceFingerprintHash,
          status: activeStatus,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    }

    if (input.ipHash && input.userAgent) {
      return tx.guestSession.findMany({
        where: {
          stayId: input.stayId,
          deviceFingerprintHash: null,
          ipHash: input.ipHash,
          userAgent: input.userAgent,
          status: activeStatus,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    }

    return [];
  }

  private async revokeActiveSessionsForSameDevice(
    tx: Prisma.TransactionClient,
    sessionIds: string[],
    closedAt: Date,
  ) {
    if (sessionIds.length === 0) {
      return { count: 0 };
    }

    return tx.guestSession.updateMany({
      where: { id: { in: sessionIds } },
      data: {
        status: GuestSessionStatus.CLOSED,
        closedAt,
      },
    });
  }

  private async countDistinctActiveDevicesForStay(
    tx: Prisma.TransactionClient | PrismaService,
    stayId: string,
  ) {
    const sessions = await tx.guestSession.findMany({
      where: {
        stayId,
        status: { in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] },
      },
      select: {
        deviceFingerprintHash: true,
        ipHash: true,
        userAgent: true,
      },
    });

    const devices = new Set<string>();
    for (const session of sessions) {
      if (session.deviceFingerprintHash) {
        devices.add(`fingerprint:${session.deviceFingerprintHash}`);
      } else if (session.ipHash && session.userAgent) {
        devices.add(`network:${session.ipHash}:${session.userAgent}`);
      } else {
        devices.add(`unknown:${devices.size}`);
      }
    }

    return devices.size;
  }

  private async createDomainEvent(
    tx: Prisma.TransactionClient,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      hotelId?: string;
      tenantId?: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return tx.domainEvent.create({
      data: {
        ...input,
        status: DomainEventStatus.PENDING,
      },
    });
  }
}
