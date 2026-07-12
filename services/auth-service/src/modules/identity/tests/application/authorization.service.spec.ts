import type { HttpMethod } from "@prisma/client";
import { AuthRepository } from "../../infrastructure/auth.repository";
import { AuthorizationService } from "../../application/authorization.service";

describe("AuthorizationService", () => {
  let service: AuthorizationService;
  let authRepository: {
    countUserWithRoutePermission: jest.Mock;
    countPermissionByMethodPath: jest.Mock;
  };

  const method: HttpMethod = "GET";
  const path = "/users/:id";

  beforeEach(() => {
    authRepository = {
      countUserWithRoutePermission: jest.fn(),
      countPermissionByMethodPath: jest.fn(),
    };

    service = new AuthorizationService(authRepository as unknown as AuthRepository);
  });

  it("returns allowed when user has matching route permission", async () => {
    authRepository.countUserWithRoutePermission.mockResolvedValue(1);

    const result = await service.checkUserRoutePermission("u1", method, path);

    expect(result).toEqual({
      allowed: true,
      permissionExists: true,
    });
    expect(authRepository.countUserWithRoutePermission).toHaveBeenCalledWith("u1", method, path);
    expect(authRepository.countPermissionByMethodPath).not.toHaveBeenCalled();
  });

  it("returns denied when permission exists but user has no role permission", async () => {
    authRepository.countUserWithRoutePermission.mockResolvedValue(0);
    authRepository.countPermissionByMethodPath.mockResolvedValue(1);

    const result = await service.checkUserRoutePermission("u1", method, path);

    expect(result).toEqual({
      allowed: false,
      permissionExists: true,
    });
  });

  it("returns denied and missing permission when permission row does not exist", async () => {
    authRepository.countUserWithRoutePermission.mockResolvedValue(0);
    authRepository.countPermissionByMethodPath.mockResolvedValue(0);

    const result = await service.checkUserRoutePermission("u1", method, path);

    expect(result).toEqual({
      allowed: false,
      permissionExists: false,
    });
  });
});
