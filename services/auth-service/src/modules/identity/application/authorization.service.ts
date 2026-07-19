import { HttpMethod } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";

export interface PermissionCheckResult {
  allowed: boolean;
  permissionExists: boolean;
}

@Injectable()
export class AuthorizationService {
  constructor(private readonly authRepository: AuthRepository) {}

  async checkUserRoutePermission(
    userId: string,
    roleId: string,
    method: HttpMethod,
    path: string,
  ): Promise<PermissionCheckResult> {
    const matchCount = await this.authRepository.countUserWithRoutePermission(
      userId,
      roleId,
      method,
      path,
    );

    if (matchCount > 0) {
      return {
        allowed: true,
        permissionExists: true,
      };
    }

    const permissionCount = await this.authRepository.countPermissionByMethodPath(method, path);

    return {
      allowed: false,
      permissionExists: permissionCount > 0,
    };
  }

  async checkUserBusinessPermission(
    userId: string,
    roleId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const matchCount = await this.authRepository.countUserWithBusinessPermission(
      userId,
      roleId,
      permissionKey,
    );
    return matchCount > 0;
  }
}
