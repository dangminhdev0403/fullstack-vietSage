/**
 * HCA HomeStay Local Provisioning Seed
 *
 * Safe, idempotent local-only seed to provision:
 * - Tenant HCA_HOMESTAY
 * - Hotel HCA_HOMESTAY (ROOM_EXCLUSIVE)
 * - User thucvn@gmail.com (HOTEL_STAFF, TENANT_OWNER)
 *
 * Security rules:
 * - Refuses execution if NODE_ENV === 'production'
 * - Reads initial password only from HCA_OWNER_INITIAL_PASSWORD environment variable
 * - Never prints, logs, or discloses passwords
 * - Reruns preserve existing user password
 */

try {
  require("dotenv").config();
} catch {}

const argon2 = require("argon2");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  PrismaClient,
  TenantType,
  TenantUserStatus,
  UserRoleStatus,
  UserStatus,
  UserType,
  HotelStatus,
  HotelStaffScopeMode,
} = require("@prisma/client");

async function seedHcaHomestayLocal(options = {}) {
  const env = options.env || process.env;
  const nodeEnv = env.NODE_ENV;

  if (nodeEnv === "production") {
    throw new Error("Seed script must not run in production environment (NODE_ENV=production)");
  }

  let prisma = options.prisma;
  let ownsPrisma = false;

  if (!prisma) {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required to run seed script");
    }
    const adapter = new PrismaPg(databaseUrl);
    prisma = new PrismaClient({ adapter });
    ownsPrisma = true;
  }

  try {
    const targetEmail = "thucvn@gmail.com";

    // 1. Upsert Tenant
    const tenant = await prisma.tenant.upsert({
      where: { code: "HCA_HOMESTAY" },
      update: {
        name: "HCA HomeStay",
        type: TenantType.HOTEL,
      },
      create: {
        code: "HCA_HOMESTAY",
        name: "HCA HomeStay",
        type: TenantType.HOTEL,
      },
    });

    // 2. Upsert Hotel
    const hotel = await prisma.hotel.upsert({
      where: { tenantId: tenant.id },
      update: {
        code: "HCA_HOMESTAY",
        name: "HCA HomeStay",
        staffScopeMode: HotelStaffScopeMode.ROOM_EXCLUSIVE,
        status: HotelStatus.ACTIVE,
        timezone: "Asia/Ho_Chi_Minh",
      },
      create: {
        tenantId: tenant.id,
        code: "HCA_HOMESTAY",
        name: "HCA HomeStay",
        staffScopeMode: HotelStaffScopeMode.ROOM_EXCLUSIVE,
        status: HotelStatus.ACTIVE,
        timezone: "Asia/Ho_Chi_Minh",
      },
    });

    // 3. Find TENANT_OWNER role
    const tenantOwnerRole = await prisma.role.findUnique({
      where: { code: "TENANT_OWNER" },
    });
    if (!tenantOwnerRole) {
      throw new Error("Role TENANT_OWNER not found in database. Run base seed first.");
    }

    // 4. Upsert User (preserving password if already exists)
    let user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      const initialPassword = env.HCA_OWNER_INITIAL_PASSWORD;
      if (!initialPassword || initialPassword.trim().length === 0) {
        throw new Error(
          "HCA_OWNER_INITIAL_PASSWORD environment variable is required to create owner user thucvn@gmail.com",
        );
      }
      const passwordHash = await argon2.hash(initialPassword);
      user = await prisma.user.create({
        data: {
          email: targetEmail,
          passwordHash,
          fullName: "Chủ đơn vị HCA HomeStay",
          status: UserStatus.ACTIVE,
          userType: UserType.HOTEL_STAFF,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ACTIVE,
          userType: UserType.HOTEL_STAFF,
        },
      });
    }

    // 5. Upsert TenantUser
    await prisma.tenantUser.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: user.id,
        },
      },
      update: {
        status: TenantUserStatus.ACTIVE,
      },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        status: TenantUserStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    // 6. Upsert UserRole (TENANT_OWNER)
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: tenantOwnerRole.id,
        },
      },
      update: {
        status: UserRoleStatus.ACTIVE,
        revokedAt: null,
        revokedById: null,
      },
      create: {
        userId: user.id,
        roleId: tenantOwnerRole.id,
        status: UserRoleStatus.ACTIVE,
      },
    });

    // 7. Ensure owner does not have a staff assignment
    await prisma.hotelStaffAssignment.deleteMany({
      where: {
        userId: user.id,
      },
    });

    return {
      success: true,
      tenantId: tenant.id,
      tenantCode: tenant.code,
      hotelId: hotel.id,
      hotelCode: hotel.code,
      hotelName: hotel.name,
      staffScopeMode: hotel.staffScopeMode,
      userId: user.id,
      userEmail: user.email,
    };
  } finally {
    if (ownsPrisma && prisma) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  seedHcaHomestayLocal()
    .then((result) => {
      console.log("HCA HomeStay local provisioning completed successfully:");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("HCA HomeStay local provisioning failed:", error.message);
      process.exit(1);
    });
}

module.exports = { seedHcaHomestayLocal };
