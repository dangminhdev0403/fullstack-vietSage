import { Injectable } from "@nestjs/common";
import { AuthRepository } from "../infrastructure/repositories/auth.repository";

@Injectable()
export class AuthorizationService {
  constructor(private readonly authRepository: AuthRepository) {}

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

  async checkUserAnyBusinessPermission(
    userId: string,
    roleId: string,
    permissionKeys: string[],
  ): Promise<boolean> {
    if (
      permissionKeys.length > 1 &&
      typeof (this.authRepository as { countUserWithAnyBusinessPermission?: unknown })
        .countUserWithAnyBusinessPermission === "function"
    ) {
      const matchCount = await (
        this.authRepository as unknown as {
          countUserWithAnyBusinessPermission: (
            u: string,
            r: string,
            keys: string[],
          ) => Promise<number>;
        }
      ).countUserWithAnyBusinessPermission(userId, roleId, permissionKeys);
      return matchCount > 0;
    }
    for (const key of permissionKeys) {
      if (await this.checkUserBusinessPermission(userId, roleId, key)) {
        return true;
      }
    }
    return false;
  }

  async getActiveRoleCode(userId: string, roleId: string): Promise<string | null> {
    return this.authRepository.findActiveRoleCode(userId, roleId);
  }
}
