/**
 * Diagnostic script: check if "hotel.rooms.view" business permission exists
 * and which roles have it assigned.
 *
 * Run with: npx tsx scripts/check-rooms-permission.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Check if the permission exists in the Permission table
  const permission = await prisma.permission.findFirst({
    where: { path: "hotel.rooms.view" },
  });

  console.log("\n=== 1. Permission record ===");
  if (permission) {
    console.log("  Found:", JSON.stringify(permission, null, 2));
  } else {
    console.log("  ❌ Permission 'hotel.rooms.view' NOT FOUND in Permission table!");
    return;
  }

  // 2. Check which roles have this permission
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { permissionId: permission.id },
    include: {
      role: { select: { id: true, code: true, name: true, status: true } },
    },
  });

  console.log("\n=== 2. Roles with hotel.rooms.view ===");
  if (rolePermissions.length === 0) {
    console.log("  ❌ No roles have this permission assigned!");
  } else {
    for (const rp of rolePermissions) {
      console.log(`  ✅ ${rp.role.code} (${rp.role.name}) [status: ${rp.role.status}]`);
    }
  }

  // 3. Check all active TENANT_OWNER userRoles to verify permission chain
  const tenantOwnerRole = await prisma.role.findFirst({
    where: { code: "TENANT_OWNER" },
  });

  console.log("\n=== 3. TENANT_OWNER role ===");
  if (!tenantOwnerRole) {
    console.log("  ❌ TENANT_OWNER role NOT FOUND!");
    return;
  }
  console.log(`  Role ID: ${tenantOwnerRole.id}`);
  console.log(`  Status: ${tenantOwnerRole.status}`);

  // 4. Verify the full permission chain for TENANT_OWNER
  const chainCheck = await prisma.rolePermission.findFirst({
    where: {
      role: { code: "TENANT_OWNER", status: "ACTIVE" },
      permission: { path: "hotel.rooms.view" },
    },
  });

  console.log("\n=== 4. TENANT_OWNER ↔ hotel.rooms.view link ===");
  if (chainCheck) {
    console.log("  ✅ Permission properly linked");
  } else {
    console.log("  ❌ Permission NOT linked to TENANT_OWNER!");
  }

  // 5. Sample a TENANT_OWNER user and check full auth chain
  const sampleUser = await prisma.userRole.findFirst({
    where: {
      role: { code: "TENANT_OWNER" },
      status: "ACTIVE",
    },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      role: { select: { id: true, code: true, status: true } },
    },
  });

  console.log("\n=== 5. Sample TENANT_OWNER user ===");
  if (!sampleUser) {
    console.log("  ❌ No active TENANT_OWNER user found!");
    return;
  }
  console.log(`  User: ${sampleUser.user.fullName} (${sampleUser.user.email})`);
  console.log(`  UserRole ID: ${sampleUser.id}, RoleId: ${sampleUser.roleId}`);

  // 6. Simulate the exact query from countUserWithBusinessPermission
  const simulatedCount = await prisma.user.count({
    where: {
      id: sampleUser.user.id,
      userRoles: {
        some: {
          roleId: sampleUser.roleId,
          status: "ACTIVE",
          role: {
            status: "ACTIVE",
            rolePermissions: {
              some: {
                permission: {
                  path: "hotel.rooms.view",
                },
              },
            },
          },
        },
      },
    },
  });

  console.log("\n=== 6. Simulated countUserWithBusinessPermission ===");
  console.log(`  Count: ${simulatedCount}`);
  if (simulatedCount > 0) {
    console.log("  ✅ Authorization would PASS for this user");
  } else {
    console.log("  ❌ Authorization would FAIL for this user!");
    console.log("  → Check: UserRole status, Role status, or RolePermission missing");
  }

  // 7. Check tenantUser and hotelAssignment for sample user
  const tenantUsers = await prisma.tenantUser.findMany({
    where: { userId: sampleUser.user.id },
    include: { tenant: { select: { id: true, name: true } } },
  });

  console.log("\n=== 7. Tenant membership ===");
  for (const tu of tenantUsers) {
    console.log(`  Tenant: ${tu.tenant.name} (${tu.tenant.id})`);
  }

  // Check hotels under these tenants
  const tenantIds = tenantUsers.map((tu) => tu.tenantId);
  const hotels = await prisma.hotel.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true, name: true, tenantId: true },
  });

  console.log("\n=== 8. Hotels under user's tenants ===");
  for (const h of hotels) {
    console.log(`  Hotel: ${h.name} (${h.id}) - Tenant: ${h.tenantId}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
