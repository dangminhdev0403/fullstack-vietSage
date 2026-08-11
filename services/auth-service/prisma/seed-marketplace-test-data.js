/**
 * Marketplace Test Data Seed
 *
 * Idempotent script to populate the database with:
 * - 3 MarketplaceCategory records
 * - 3 Service Tenants (near ≈2km, medium ≈15km, far ≈40km from first hotel)
 *
 * Run: node prisma/seed-marketplace-test-data.js
 * Requires: DATABASE_URL in .env
 */
require("dotenv").config();
const crypto = require("node:crypto");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  PrismaClient,
  TenantType,
  TenantUserStatus,
  UserRoleStatus,
  UserStatus,
  UserType,
} = require("@prisma/client");

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/vietsage_dev";
const adapter = new PrismaPg(databaseUrl);
const prisma = new PrismaClient({ adapter });


/* ───── Coordinates ───── */
// Default: central Hanoi
const DEFAULT_LAT = 21.028511;
const DEFAULT_LNG = 105.804817;

/**
 * Offset a coordinate by roughly `km` kilometres.
 * 1° latitude  ≈ 111 km
 * 1° longitude ≈ 111 km × cos(latitude)
 */
function offsetCoords(lat, lng, kmNorth, kmEast) {
  return {
    latitude: lat + kmNorth / 111,
    longitude: lng + kmEast / (111 * Math.cos((lat * Math.PI) / 180)),
  };
}

/* ───── Categories ───── */
const CATEGORIES = [
  { nameVi: "Spa & Chăm sóc sức khỏe", nameEn: "Spa & Wellness", icon: "spa", sortOrder: 1 },
  { nameVi: "Nhà hàng & Ẩm thực", nameEn: "Restaurant & Dining", icon: "restaurant", sortOrder: 2 },
  { nameVi: "Vận chuyển & Du lịch", nameEn: "Transport & Tours", icon: "directions_car", sortOrder: 3 },
];

/* ───── Service Tenants ───── */
function buildTenants(baseLat, baseLng) {
  return [
    {
      code: "TEST_SPA_NEAR",
      name: "Công ty TNHH An Nhiên Spa",
      displayName: "An Nhiên Spa & Wellness",
      description: "Trung tâm spa và chăm sóc sức khỏe cao cấp.",
      phone: "0901234567",
      address: "12 Nguyễn Du, Hai Bà Trưng, Hà Nội",
      ...offsetCoords(baseLat, baseLng, 1.5, 1.0), // ≈2 km
      ownerEmail: "spa-owner@test.vietsage.local",
      ownerName: "Nguyễn Thị Lan",
    },
    {
      code: "TEST_RESTAURANT_MID",
      name: "Nhà hàng Bốn Mùa",
      displayName: "Bốn Mùa Fine Dining",
      description: "Nhà hàng ẩm thực đương đại Việt Nam.",
      phone: "0912345678",
      address: "88 Lê Thánh Tông, Hoàn Kiếm, Hà Nội",
      ...offsetCoords(baseLat, baseLng, 10, 10), // ≈15 km
      ownerEmail: "restaurant-owner@test.vietsage.local",
      ownerName: "Trần Văn Bình",
    },
    {
      code: "TEST_TRANSPORT_FAR",
      name: "Xe Du Lịch Phương Đông",
      displayName: "Phương Đông Travel",
      description: "Dịch vụ vận chuyển và tour du lịch.",
      phone: "0923456789",
      address: "256 Đường Láng, Đống Đa, Hà Nội",
      ...offsetCoords(baseLat, baseLng, 30, 25), // ≈40 km (sẽ bị lọc ra)
      ownerEmail: "transport-owner@test.vietsage.local",
      ownerName: "Lê Hoàng Minh",
    },
  ];
}

const DEFAULT_PASSWORD = "TestPass123!";

async function seedCategories() {
  console.log("\n📂 Seeding MarketplaceCategory...");
  for (const cat of CATEGORIES) {
    const existing = await prisma.marketplaceCategory.findFirst({
      where: { nameVi: cat.nameVi },
      select: { id: true, code: true },
    });
    if (existing) {
      console.log(`  ✓ Category "${cat.nameVi}" already exists (${existing.code})`);
      continue;
    }
    // Generate a simple code
    const count = await prisma.marketplaceCategory.count();
    const code = `VSH_MKTCAT_${String(count + 1).padStart(4, "0")}`;
    const created = await prisma.marketplaceCategory.create({
      data: { ...cat, code },
    });
    console.log(`  + Created category "${cat.nameVi}" → ${created.code}`);
  }
}

async function seedServiceTenants(baseLat, baseLng) {
  console.log("\n🏪 Seeding Service Tenants...");

  const role = await prisma.role.upsert({
    where: { code: "SERVICE_STAFF" },
    update: {},
    create: { code: "SERVICE_STAFF", name: "Nhân viên Service Tenant" },
  });

  const servicePermissions = await prisma.permission.findMany({
    where: { path: { in: ["service.marketplace.view", "service.marketplace.manage"] } },
    select: { id: true },
  });

  const tenants = buildTenants(baseLat, baseLng);
  for (const t of tenants) {
    const existing = await prisma.tenant.findFirst({
      where: { code: t.code, type: TenantType.SERVICE },
      select: { id: true },
    });
    if (existing) {
      console.log(`  ✓ Tenant "${t.displayName}" already exists`);
      continue;
    }

    // Deterministic password hash for test only
    const passwordHash = crypto
      .createHash("sha256")
      .update(DEFAULT_PASSWORD)
      .digest("hex");

    const tenant = await prisma.tenant.create({
      data: {
        code: t.code,
        name: t.name,
        type: TenantType.SERVICE,
        serviceProfile: {
          create: {
            displayName: t.displayName,
            description: t.description,
            phone: t.phone,
            address: t.address,
            latitude: t.latitude,
            longitude: t.longitude,
            locationAccuracyMeters: 50,
            locationSource: "MANUAL",
            locationVerifiedAt: new Date(),
            status: "ACTIVE",
          },
        },
      },
    });

    const owner = await prisma.user.upsert({
      where: { email: t.ownerEmail },
      update: {},
      create: {
        email: t.ownerEmail,
        fullName: t.ownerName,
        passwordHash,
        status: UserStatus.ACTIVE,
        userType: UserType.PARTNER,
      },
    });

    await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: owner.id,
        status: TenantUserStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: owner.id, roleId: role.id } },
      update: {},
      create: {
        userId: owner.id,
        roleId: role.id,
        status: UserRoleStatus.ACTIVE,
      },
    });

    // Sync service permissions to role
    for (const perm of servicePermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }

    let dist = "≈40km";
    if (t.code.includes("NEAR")) {
      dist = "≈2km";
    } else if (t.code.includes("MID")) {
      dist = "≈15km";
    }
    console.log(`  + Created "${t.displayName}" (${dist}) → owner: ${t.ownerEmail}`);
  }
}

async function main() {
  console.log("🌱 Marketplace Test Data Seed");
  console.log("━".repeat(50));

  // Find the first hotel with coordinates
  const hotel = await prisma.hotel.findFirst({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });

  let baseLat = DEFAULT_LAT;
  let baseLng = DEFAULT_LNG;

  if (hotel) {
    baseLat = Number(hotel.latitude);
    baseLng = Number(hotel.longitude);
    console.log(`📍 Base hotel: "${hotel.name}" (${baseLat}, ${baseLng})`);
  } else {
    console.log(`📍 No hotel with coordinates found. Using default Hanoi (${baseLat}, ${baseLng})`);
  }

  await seedCategories();
  await seedServiceTenants(baseLat, baseLng);

  console.log("\n" + "━".repeat(50));
  console.log("✅ Marketplace test data seeded successfully!");
  console.log(`\n🔑 Test account password: ${DEFAULT_PASSWORD}`);
  console.log("   Emails: spa-owner@test.vietsage.local");
  console.log("           restaurant-owner@test.vietsage.local");
  console.log("           transport-owner@test.vietsage.local");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
