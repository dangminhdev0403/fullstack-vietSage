import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { loadAppConfig } from "../../common/config/env.config";
import { publicMatcher } from "../../common/config/routes.config";
import { AppLogger } from "../../common/logging/app-logger.service";
import { AuthorizationService } from "../../modules/identity/identity-public";
import { REQUIRED_ACTIVE_ROLE_KEY } from "../decorators/require-active-role.decorator";
import { REQUIRED_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { SKIP_AUTHORIZATION_KEY } from "../decorators/skip-authorization.decorator";
import type { AuthenticatedUser } from "../security";

interface RequestWithAuthenticatedUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly config = loadAppConfig();

  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly reflector: Reflector = new Reflector(),
    private readonly logger: AppLogger = new AppLogger(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType?.() && context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();
    if (publicMatcher.isPublic(request.path)) return true;

    const authorizationTargets = [context.getHandler?.(), context.getClass?.()].filter(
      (target): target is NonNullable<typeof target> => Boolean(target),
    );
    const skipAuthorization = authorizationTargets.length
      ? this.reflector.getAllAndOverride<boolean>(SKIP_AUTHORIZATION_KEY, authorizationTargets)
      : false;
    if (skipAuthorization) return true;

    if (!this.config.authz.enforcementEnabled) {
      this.logger.debug("Authorization enforcement is disabled, so the request was allowed", {
        module: "authz",
        service: "AuthorizationGuard",
        operation: "canActivate",
        event: "AUTHORIZATION_BYPASSED",
        reason: "enforcement_disabled",
      });
      return true;
    }

    const userId = request.user?.userId;
    const roleId = request.user?.roleId;
    if (!userId || !roleId) {
      this.logger.warn("Authorization failed because no authenticated user was attached", {
        module: "authz",
        service: "AuthorizationGuard",
        operation: "canActivate",
        event: "AUTHORIZATION_FAILURE",
        reason: userId ? "active_role_missing" : "unauthenticated",
        method: request.method,
        path: request.path,
      });
      throw new ForbiddenException("Unauthenticated");
    }

    const permissionKey = authorizationTargets.length
      ? this.reflector.getAllAndOverride<string | string[]>(
          REQUIRED_PERMISSION_KEY,
          authorizationTargets,
        )
      : undefined;
    if (!permissionKey) {
      this.logger.warn("Authorization failed because business permission metadata is missing", {
        module: "authz",
        service: "AuthorizationGuard",
        operation: "canActivate",
        event: "AUTHORIZATION_FAILURE",
        reason: "business_permission_metadata_missing",
        method: request.method,
        path: request.path,
      });
      throw new ForbiddenException("Business permission metadata is required");
    }

    const permissionKeys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
    let permissionAllowed = false;
    if (
      permissionKeys.length > 1 &&
      typeof this.authorizationService.checkUserAnyBusinessPermission === "function"
    ) {
      permissionAllowed = await this.authorizationService.checkUserAnyBusinessPermission(
        userId,
        roleId,
        permissionKeys,
      );
    } else {
      for (const key of permissionKeys) {
        const allowed = await this.authorizationService.checkUserBusinessPermission(
          userId,
          roleId,
          key,
        );
        if (allowed) {
          permissionAllowed = true;
          break;
        }
      }
    }

    if (!permissionAllowed) {
      this.logger.warn(
        "Authorization failed because the user lacks the required business permission",
        {
          module: "authz",
          service: "AuthorizationGuard",
          operation: "canActivate",
          event: "AUTHORIZATION_FAILURE",
          reason: "insufficient_business_permission",
          userId,
          permissionKey,
          method: request.method,
          path: request.path,
        },
      );
      throw new ForbiddenException("You do not have permission to access this resource");
    }

    const requiredActiveRole = authorizationTargets.length
      ? this.reflector.getAllAndOverride<string | string[]>(
          REQUIRED_ACTIVE_ROLE_KEY,
          authorizationTargets,
        )
      : undefined;

    if (!requiredActiveRole) {
      return true;
    }

    const activeRoleCode = await this.authorizationService.getActiveRoleCode(userId, roleId);
    if (!activeRoleCode) {
      this.logger.warn("Authorization failed because the active role could not be resolved", {
        module: "authz",
        service: "AuthorizationGuard",
        operation: "canActivate",
        event: "AUTHORIZATION_FAILURE",
        reason: "active_role_not_found",
        userId,
        roleId,
        method: request.method,
        path: request.path,
      });
      throw new ForbiddenException("You do not have permission to access this resource");
    }

    const allowedRoleCodes = Array.isArray(requiredActiveRole)
      ? requiredActiveRole
      : [requiredActiveRole];

    if (!allowedRoleCodes.includes(activeRoleCode)) {
      this.logger.warn(
        "Authorization failed because the active role does not match the required role",
        {
          module: "authz",
          service: "AuthorizationGuard",
          operation: "canActivate",
          event: "AUTHORIZATION_FAILURE",
          reason: "mismatched_active_role",
          userId,
          activeRoleCode,
          requiredActiveRole,
          method: request.method,
          path: request.path,
        },
      );
      throw new ForbiddenException("You do not have permission to access this resource");
    }

    return true;
  }
}
