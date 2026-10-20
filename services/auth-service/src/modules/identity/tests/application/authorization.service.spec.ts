import { AuthorizationService } from "../../application/authorization.service";
import { AuthRepository } from "../../infrastructure/repositories/auth.repository";

describe("AuthorizationService", () => {
  it("checks a business capability only within the active session role", async () => {
    const countUserWithBusinessPermission = jest.fn().mockResolvedValue(1);
    const service = new AuthorizationService({
      countUserWithBusinessPermission,
    } as unknown as AuthRepository);

    await expect(
      service.checkUserBusinessPermission("u1", "role-active", "hotel.requests.view"),
    ).resolves.toBe(true);
    expect(countUserWithBusinessPermission).toHaveBeenCalledWith(
      "u1",
      "role-active",
      "hotel.requests.view",
    );
  });

  it("denies a missing business capability", async () => {
    const service = new AuthorizationService({
      countUserWithBusinessPermission: jest.fn().mockResolvedValue(0),
    } as unknown as AuthRepository);

    await expect(
      service.checkUserBusinessPermission("u1", "role-active", "hotel.requests.manage"),
    ).resolves.toBe(false);
  });

  it("resolves active role code from repository", async () => {
    const findActiveRoleCode = jest.fn().mockResolvedValue("TENANT_OWNER");
    const service = new AuthorizationService({
      findActiveRoleCode,
    } as unknown as AuthRepository);

    await expect(service.getActiveRoleCode("u1", "role-active")).resolves.toBe("TENANT_OWNER");
    expect(findActiveRoleCode).toHaveBeenCalledWith("u1", "role-active");
  });

  it("returns null when active role is not found or inactive", async () => {
    const findActiveRoleCode = jest.fn().mockResolvedValue(null);
    const service = new AuthorizationService({
      findActiveRoleCode,
    } as unknown as AuthRepository);

    await expect(service.getActiveRoleCode("u1", "role-active")).resolves.toBeNull();
  });
});
