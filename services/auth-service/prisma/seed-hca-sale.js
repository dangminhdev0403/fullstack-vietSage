const argon2 = require("argon2");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  PrismaClient,
  TenantUserStatus,
  UserRoleStatus,
  UserStatus,
  UserType,
  RoomStatus,
} = require("@prisma/client");

require("dotenv").config();

async function seedHcaSale() {
  const adapter = new PrismaPg(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { code: "HCA_HOMESTAY" } });
    if (!tenant) throw new Error("Tenant HCA_HOMESTAY not found. Run seed-hca-homestay-local.js first.");

    const hotel = await prisma.hotel.findUnique({ where: { tenantId: tenant.id } });
    if (!hotel) throw new Error("Hotel HCA_HOMESTAY not found.");

    const frontdeskRole = await prisma.role.findUnique({ where: { code: "HOTEL_FRONTDESK" } });
    if (!frontdeskRole) throw new Error("Role HOTEL_FRONTDESK not found.");

    const ownerUser = await prisma.user.findUnique({ where: { email: "thucvn@gmail.com" } });

    // 1. Create Rooms for HCA HomeStay
    const room101 = await prisma.room.upsert({
      where: {
        hotelId_roomNumber: {
          hotelId: hotel.id,
          roomNumber: "101",
        },
      },
      update: {
        type: "Tiêu chuẩn",
        floor: "1",
        status: RoomStatus.AVAILABLE,
      },
      create: {
        hotelId: hotel.id,
        code: `HCA_ROOM_101_${hotel.id.slice(-6)}`,
        roomNumber: "101",
        floor: "1",
        type: "Tiêu chuẩn",
        price: 500000,
        status: RoomStatus.AVAILABLE,
      },
    });

    const room102 = await prisma.room.upsert({
      where: {
        hotelId_roomNumber: {
          hotelId: hotel.id,
          roomNumber: "102",
        },
      },
      update: {
        type: "VIP",
        floor: "1",
        status: RoomStatus.AVAILABLE,
      },
      create: {
        hotelId: hotel.id,
        code: `HCA_ROOM_102_${hotel.id.slice(-6)}`,
        roomNumber: "102",
        floor: "1",
        type: "VIP",
        price: 800000,
        status: RoomStatus.AVAILABLE,
      },
    });

    // 2. Create Sale / Frontdesk user
    const saleEmail = "sale.hca@vietsage.vn";
    const initialPassword = process.env.HCA_SALE_INITIAL_PASSWORD;
    if (!initialPassword) throw new Error("HCA_SALE_INITIAL_PASSWORD is required");
    const passwordHash = await argon2.hash(initialPassword);

    const saleUser = await prisma.user.upsert({
      where: { email: saleEmail },
      update: {
        passwordHash,
        fullName: "HCA 101",
        status: UserStatus.ACTIVE,
        userType: UserType.HOTEL_STAFF,
      },
      create: {
        email: saleEmail,
        passwordHash,
        fullName: "HCA 101",
        status: UserStatus.ACTIVE,
        userType: UserType.HOTEL_STAFF,
      },
    });

    // 3. Link to Tenant
    await prisma.tenantUser.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: saleUser.id,
        },
      },
      update: {
        status: TenantUserStatus.ACTIVE,
      },
      create: {
        tenantId: tenant.id,
        userId: saleUser.id,
        status: TenantUserStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    // 4. Link Role HOTEL_FRONTDESK
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: saleUser.id,
          roleId: frontdeskRole.id,
        },
      },
      update: {
        status: UserRoleStatus.ACTIVE,
        revokedAt: null,
      },
      create: {
        userId: saleUser.id,
        roleId: frontdeskRole.id,
        status: UserRoleStatus.ACTIVE,
      },
    });

    // 5. Link HotelStaffAssignment
    await prisma.hotelStaffAssignment.upsert({
      where: {
        userId_hotelId: {
          userId: saleUser.id,
          hotelId: hotel.id,
        },
      },
      update: {
        revokedAt: null,
      },
      create: {
        hotelId: hotel.id,
        userId: saleUser.id,
        assignedById: ownerUser?.id || null,
      },
    });

    // 6. Assign Room 101 to Sale User
    await prisma.hotelRoomStaffAssignment.upsert({
      where: {
        userId: saleUser.id,
      },
      update: {
        roomId: room101.id,
        hotelId: hotel.id,
        assignedById: ownerUser?.id || null,
      },
      create: {
        hotelId: hotel.id,
        roomId: room101.id,
        userId: saleUser.id,
        assignedById: ownerUser?.id || null,
      },
    });

    console.log("HCA Sale provisioned successfully:", {
      saleEmail,
      roomNumber: room101.roomNumber,
      hotelName: hotel.name,
    });
  } finally {
    await prisma.$disconnect();
  }
}

seedHcaSale().catch((err) => {
  console.error("Failed to seed HCA sale:", err);
  process.exit(1);
});
