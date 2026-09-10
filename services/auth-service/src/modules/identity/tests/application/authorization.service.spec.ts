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
});
