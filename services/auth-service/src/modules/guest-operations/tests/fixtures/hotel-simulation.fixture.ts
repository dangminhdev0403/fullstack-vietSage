import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  GuestStayStatus,
  HotelStatus,
  PrismaClient,
  RoleStatus,
  RoomQRCodeStatus,
  RoomStatus,
  ServiceCatalogStatus,
  TenantUserStatus,
  UserRoleStatus,
} from "@prisma/client";

export const QA_SIM_PREFIX = "QA_SIM_HOTEL_REQUESTS";
export const QA_SIM_ROOM_COUNT = 6;

export interface HotelSimulationFixture {
  prisma: PrismaClient;
  ownerUserId: string;
  tenantId: string;
  primaryHotelId: string;
  secondaryHotelId: string;
  serviceItemId: string;
  primaryRooms: Array<{ roomId: string; stayId: string; qrCode: string }>;
  secondaryRoom: { roomId: string; stayId: string; qrCode: string };
}

export function createQaSimulationPrisma(databaseUrl: string) {
  return new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
}

export async function provisionHotelSimulation(
  prisma: PrismaClient,
): Promise<HotelSimulationFixture> {
  const tenantId = `${QA_SIM_PREFIX}_TENANT`;
  const primaryHotelId = `${QA_SIM_PREFIX}_HOTEL_A`;
  const secondaryHotelId = `${QA_SIM_PREFIX}_HOTEL_B`;
  const requestedOwnerId = process.env.QA_HOTEL_SIM_OWNER_USER_ID?.trim();

  const owner = await prisma.user.findFirst({
    where: {
      ...(requestedOwnerId ? { id: requestedOwnerId } : {}),
      userRoles: {
        some: {
          status: UserRoleStatus.ACTIVE,
          role: {
            status: RoleStatus.ACTIVE,
            code: { in: ["TENANT_OWNER", "HOTEL_OWNER", "HOTEL_MANAGER", "SUPER_ADMIN"] },
          },
        },
      },
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (!owner) {
    throw new Error(
      "QA hotel simulation requires an existing active owner/operator account; optionally set QA_HOTEL_SIM_OWNER_USER_ID.",
    );
  }

  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.tenant.create({
    data: { id: tenantId, code: tenantId, name: `${QA_SIM_PREFIX} Tenant` },
  });
  await prisma.tenantUser.create({
    data: {
      id: `${QA_SIM_PREFIX}_OWNER_MEMBERSHIP`,
      tenantId,
      userId: owner.id,
      status: TenantUserStatus.ACTIVE,
      joinedAt: new Date("2026-07-15T00:00:00.000Z"),
    },
  });

  await prisma.hotel.createMany({
    data: [
      {
        id: primaryHotelId,
        tenantId,
        code: `${QA_SIM_PREFIX}_A`,
        name: `${QA_SIM_PREFIX} Primary Hotel`,
        status: HotelStatus.ACTIVE,
      },
      {
        id: secondaryHotelId,
        tenantId,
        code: `${QA_SIM_PREFIX}_B`,
        name: `${QA_SIM_PREFIX} Secondary Hotel`,
        status: HotelStatus.ACTIVE,
      },
    ],
  });

  const categoryId = `${QA_SIM_PREFIX}_CATEGORY`;
  const serviceItemId = `${QA_SIM_PREFIX}_SERVICE_ITEM`;
  await prisma.hotelServiceCategory.create({
    data: {
      id: categoryId,
      hotelId: primaryHotelId,
      importKey: `${QA_SIM_PREFIX}_CATEGORY`,
      name: `${QA_SIM_PREFIX} Guest Services`,
      defaultPrice: 25000,
      currency: "VND",
      status: ServiceCatalogStatus.ACTIVE,
    },
  });
  await prisma.hotelServiceItem.create({
    data: {
      id: serviceItemId,
      hotelId: primaryHotelId,
      categoryId,
      importKey: `${QA_SIM_PREFIX}_SERVICE_ITEM`,
      name: `${QA_SIM_PREFIX} Extra Towels`,
      quantityEnabled: true,
      minQuantity: 1,
      maxQuantity: 5,
      status: ServiceCatalogStatus.ACTIVE,
    },
  });

  const primaryRooms: HotelSimulationFixture["primaryRooms"] = [];
  for (let index = 1; index <= QA_SIM_ROOM_COUNT; index += 1) {
    primaryRooms.push(
      await createOccupiedRoom(prisma, {
        hotelId: primaryHotelId,
        suffix: `A_${index}`,
        roomNumber: `QA-A-${index.toString().padStart(2, "0")}`,
      }),
    );
  }
  const secondaryRoom = await createOccupiedRoom(prisma, {
    hotelId: secondaryHotelId,
    suffix: "B_1",
    roomNumber: "QA-B-01",
  });

  return {
    prisma,
    ownerUserId: owner.id,
    tenantId,
    primaryHotelId,
    secondaryHotelId,
    serviceItemId,
    primaryRooms,
    secondaryRoom,
  };
}

async function createOccupiedRoom(
  prisma: PrismaClient,
  input: { hotelId: string; suffix: string; roomNumber: string },
) {
  const roomId = `${QA_SIM_PREFIX}_ROOM_${input.suffix}`;
  const stayId = `${QA_SIM_PREFIX}_STAY_${input.suffix}`;
  const qrCode = `${QA_SIM_PREFIX}_QR_${input.suffix}`;
  const qrId = `${QA_SIM_PREFIX}_QR_ID_${input.suffix}`;

  await prisma.room.create({
    data: {
      id: roomId,
      hotelId: input.hotelId,
      code: `${QA_SIM_PREFIX}_${input.suffix}`,
      roomNumber: input.roomNumber,
      status: RoomStatus.OCCUPIED,
      maxActiveGuestDevices: 3,
    },
  });
  await prisma.roomQRCode.create({
    data: {
      id: qrId,
      hotelId: input.hotelId,
      roomId,
      publicCode: qrCode,
      status: RoomQRCodeStatus.ACTIVE,
      activatedAt: new Date("2026-07-15T00:00:00.000Z"),
    },
  });
  await prisma.guestStay.create({
    data: {
      id: stayId,
      hotelId: input.hotelId,
      roomId,
      reservationCode: `${QA_SIM_PREFIX}_RES_${input.suffix}`,
      guestDisplayName: `${QA_SIM_PREFIX} Guest ${input.suffix}`,
      status: GuestStayStatus.ACTIVE,
      plannedCheckInAt: new Date("2026-07-14T12:00:00.000Z"),
      plannedCheckOutAt: new Date("2030-07-20T12:00:00.000Z"),
      checkedInAt: new Date("2026-07-14T12:00:00.000Z"),
      activatedAt: new Date("2026-07-14T12:00:00.000Z"),
    },
  });
  await prisma.folio.create({
    data: {
      id: `${QA_SIM_PREFIX}_FOLIO_${input.suffix}`,
      hotelId: input.hotelId,
      stayId,
      roomId,
      folioNumber: `${QA_SIM_PREFIX}_FOLIO_NO_${input.suffix}`,
      metadataJson: {
        fixture: QA_SIM_PREFIX,
        checksum: createHash("sha256").update(stayId).digest("hex"),
      },
    },
  });

  return { roomId, stayId, qrCode };
}
