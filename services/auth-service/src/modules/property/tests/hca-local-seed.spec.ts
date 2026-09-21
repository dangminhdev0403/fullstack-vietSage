import { HotelStaffScopeMode } from "@prisma/client";

// The seed is CommonJS because Prisma executes it directly with Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedHcaHomestayLocal } = require("../../../../prisma/seed-hca-homestay-local.js");

describe("HCA Local Provisioning Seed (seedHcaHomestayLocal)", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        upsert: jest.fn().mockResolvedValue({
          id: "tenant-hca-1",
          code: "HCA_HOMESTAY",
          name: "HCA HomeStay",
        }),
      },
      hotel: {
        upsert: jest.fn().mockResolvedValue({
          id: "hotel-hca-1",
          tenantId: "tenant-hca-1",
          code: "HCA_HOMESTAY",
          name: "HCA HomeStay",
          staffScopeMode: HotelStaffScopeMode.ROOM_EXCLUSIVE,
        }),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({
          id: "role-tenant-owner-1",
          code: "TENANT_OWNER",
        }),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenantUser: {
        upsert: jest.fn().mockResolvedValue({ id: "tu-1" }),
      },
      userRole: {
        upsert: jest.fn().mockResolvedValue({ id: "ur-1" }),
      },
      hotelStaffAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
  });

  it("fails if NODE_ENV is production", async () => {
    await expect(
      seedHcaHomestayLocal({
        prisma: mockPrisma,
        env: { NODE_ENV: "production" },
      }),
    ).rejects.toThrow("Seed script must not run in production environment");
  });

  it("fails if user does not exist and HCA_OWNER_INITIAL_PASSWORD is missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      seedHcaHomestayLocal({
        prisma: mockPrisma,
        env: { NODE_ENV: "development" },
      }),
    ).rejects.toThrow("HCA_OWNER_INITIAL_PASSWORD environment variable is required");
  });

  it("successfully creates tenant, hotel, user, and relations when user is missing and password provided", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "user-thuc-1",
      email: "thucvn@gmail.com",
    });

    const result = await seedHcaHomestayLocal({
      prisma: mockPrisma,
      env: {
        NODE_ENV: "development",
        HCA_OWNER_INITIAL_PASSWORD: "ValidSecretPassword123!",
      },
    });

    expect(result.success).toBe(true);
    expect(result.tenantCode).toBe("HCA_HOMESTAY");
    expect(result.hotelCode).toBe("HCA_HOMESTAY");
    expect(result.staffScopeMode).toBe(HotelStaffScopeMode.ROOM_EXCLUSIVE);
    expect(result.userEmail).toBe("thucvn@gmail.com");

    expect(mockPrisma.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: "HCA_HOMESTAY" },
      }),
    );

    expect(mockPrisma.hotel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-hca-1" },
        create: expect.objectContaining({
          staffScopeMode: HotelStaffScopeMode.ROOM_EXCLUSIVE,
        }),
      }),
    );

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "thucvn@gmail.com",
          userType: "HOTEL_STAFF",
        }),
      }),
    );

    expect(mockPrisma.tenantUser.upsert).toHaveBeenCalled();
    expect(mockPrisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          roleId: "role-tenant-owner-1",
        }),
      }),
    );
  });

  it("is idempotent: preserves existing user and does not require password on rerun", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-thuc-existing",
      email: "thucvn@gmail.com",
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$existinghash",
    });
    mockPrisma.user.update.mockResolvedValue({
      id: "user-thuc-existing",
      email: "thucvn@gmail.com",
    });

    const result = await seedHcaHomestayLocal({
      prisma: mockPrisma,
      env: {
        NODE_ENV: "development",
        // Notice: NO HCA_OWNER_INITIAL_PASSWORD provided
      },
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-thuc-existing" },
        data: expect.objectContaining({
          status: "ACTIVE",
          userType: "HOTEL_STAFF",
        }),
      }),
    );
  });
});
