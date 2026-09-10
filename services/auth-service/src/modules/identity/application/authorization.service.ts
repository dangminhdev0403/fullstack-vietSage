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
}
