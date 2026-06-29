const crypto = require('node:crypto');
const {
  PrismaClient,
  UserStatus,
  UserType,
  TenantUserStatus,
  UserRoleStatus,
} = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_ROLES = [
  { code: 'SUPER_ADMIN', name: 'Quản trị viên cấp cao' },
  { code: 'VIETSAGE_OPERATION', name: 'Vận hành VietSage' },
  { code: 'TENANT_OWNER', name: 'Chủ đơn vị' },
  { code: 'HOTEL_OWNER', name: 'Chủ khách sạn' },
  { code: 'HOTEL_MANAGER', name: 'Quản lý khách sạn' },
  { code: 'HOTEL_FRONTDESK', name: 'Lễ tân khách sạn' },
  { code: 'HOTEL_HOUSEKEEPING', name: 'Buồng phòng khách sạn' },
  { code: 'HOTEL_FNB', name: 'Ẩm thực khách sạn' },
  { code: 'HOTEL_FINANCE', name: 'Tài chính khách sạn' },
];

const DEFAULT_CODES = ['TENANT', 'HOTEL', 'ROOM', 'SERVICE', 'AIRPORT', 'RESERVATION'];

async function seedCodes() {
  for (const name of DEFAULT_CODES) {
    await prisma.code.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function seedRoles() {
  const roleByCode = new Map();
  for (const role of DEFAULT_ROLES) {
    const savedRole = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
    roleByCode.set(savedRole.code, savedRole);
  }

  const superAdminRole = roleByCode.get('SUPER_ADMIN');
  if (!superAdminRole) {
    throw new Error('Không tạo được vai trò SUPER_ADMIN.');
  }

  return { superAdminRole };
}

async function syncExistingPermissionsToSuperAdmin(superAdminRole) {
  const permissions = await prisma.permission.findMany({
    select: { id: true },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permission.id,
      },
    });
  }
}

async function seedSuperAdmin(superAdminRole) {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'VIETSAGE_ROOT' },
    update: { name: 'Tenant gốc VietSage' },
    create: {
      code: 'VIETSAGE_ROOT',
      name: 'Tenant gốc VietSage',
    },
  });

  const superAdminEmail =
    process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@vietsage.local';

  // Temporary deterministic hash for bootstrap only.
  const passwordHash = crypto
    .createHash('sha256')
    .update(process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!')
    .digest('hex');

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      fullName: 'Quản trị viên cấp cao VietSage',
      status: UserStatus.ACTIVE,
      userType: UserType.VIETSAGE_ADMIN,
    },
    create: {
      email: superAdminEmail,
      passwordHash,
      fullName: 'Quản trị viên cấp cao VietSage',
      status: UserStatus.ACTIVE,
      userType: UserType.VIETSAGE_ADMIN,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {
      status: UserRoleStatus.ACTIVE,
      revokedAt: null,
      revokedById: null,
    },
    create: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
      status: UserRoleStatus.ACTIVE,
    },
  });

  await prisma.tenantUser.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: superAdmin.id,
      },
    },
    update: {
      status: TenantUserStatus.ACTIVE,
      joinedAt: new Date(),
    },
    create: {
      tenantId: tenant.id,
      userId: superAdmin.id,
      status: TenantUserStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
}

async function main() {
  await seedCodes();
  const { superAdminRole } = await seedRoles();
  await seedSuperAdmin(superAdminRole);
  await syncExistingPermissionsToSuperAdmin(superAdminRole);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

