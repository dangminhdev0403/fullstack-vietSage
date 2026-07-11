import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { loadAppConfig } from "../../common/config/env.config";
import { publicMatcher } from "../../common/config/routes.config";
import type { AuthenticatedUser } from "../security";
import { AuthorizationService } from "../../modules/auth/services/authorization.service";
import {
  isPermissionPathTooLong,
  resolveRoutePermissionKeyFromRequest,
} from "../../modules/auth/utils/route-permission-key.util";
import { AppLogger } from "../../common/logging/app-logger.service";
import { REQUIRED_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { SKIP_AUTHORIZATION_KEY } from "../decorators/skip-authorization.decorator";

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
    if (context.getType?.() && context.getType() !== "http") {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();

    if (publicMatcher.isPublic(request.path)) {
      return true;
    }

    const authorizationTargets = [context.getHandler?.(), context.getClass?.()].filter(
      (target): target is NonNullable<typeof target> => Boolean(target),
    );
    const skipAuthorization = authorizationTargets.length
      ? this.reflector.getAllAndOverride<boolean>(SKIP_AUTHORIZATION_KEY, authorizationTargets)
      : false;

    if (skipAuthorization) {
      return true;
    }

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
    if (!userId) {
      this.logger.warn("Authorization failed because no authenticated user was attached", {
        module: "authz",
        service: "AuthorizationGuard",
        operation: "canActivate",
        event: "AUTHORIZATION_FAILURE",
        reason: "unauthenticated",
        method: request.method,
        path: request.path,
      });
      throw new ForbiddenException("Unauthenticated");
    }

    const explicitPermissionKey = authorizationTargets.length
      ? this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, authorizationTargets)
      : undefined;

    if (explicitPermissionKey) {
      return this.authorizeBusinessPermission(request, userId, explicitPermissionKey);
    }

    const permissionKey = resolveRoutePermissionKeyFromRequest(request);
    if (!permissionKey) {
      return this.handleUnresolvedRoute(request);
    }

    if (isPermissionPathTooLong(permissionKey.path)) {
      return this.handleOversizedPermissionPath(permissionKey.method, permissionKey.path);
    }

    const permissionResult = await this.authorizationService.checkUserRoutePermission(
      userId,
      permissionKey.method,
      permissionKey.path,
    );

    if (permissionResult.allowed) {
      return true;
    }

    if (!permissionResult.permissionExists && !this.config.authz.strictMode) {
      this.logger.warn(
        "Permission was missing but strict mode is off, so the request was allowed",
        {
          module: "authz",
          service: "AuthorizationGuard",
          operation: "canActivate",
          event: "AUTHORIZATION_BYPASSED",
          reason: "permission_missing_strict_mode_off",
          userId,
          method: permissionKey.method,
          path: permissionKey.path,
        },
      );
      return true;
    }

    this.logger.warn("Authorization failed because the user lacks the required permission", {
      module: "authz",
      service: "AuthorizationGuard",
      operation: "canActivate",
      event: "AUTHORIZATION_FAILURE",
      reason: permissionResult.permissionExists
        ? "insufficient_permission"
        : "permission_missing_strict_mode_on",
      userId,
      method: permissionKey.method,
      path: permissionKey.path,
    });
    throw new ForbiddenException("You do not have permission to access this resource");
  }

  private async authorizeBusinessPermission(
    request: Request,
    userId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const allowed = await this.authorizationService.checkUserBusinessPermission(
      userId,
      permissionKey,
    );
    if (allowed) {
      return true;
    }

    this.logger.warn(
      "Authorization failed because the user lacks the required business permission",
      {
        module: "authz",
        service: "AuthorizationGuard",
        operation: "authorizeBusinessPermission",
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

  private handleUnresolvedRoute(request: Request): boolean {
    const message = `Route path not resolved for ${request.method} ${request.originalUrl}`;

    if (this.config.authz.strictMode) {
      throw new ForbiddenException(message);
    }

    this.logger.warn("Route permission could not be resolved, but strict mode is off", {
      module: "authz",
      service: "AuthorizationGuard",
      operation: "handleUnresolvedRoute",
      event: "AUTHORIZATION_BYPASSED",
      reason: "route_permission_unresolved_strict_mode_off",
      method: request.method,
      url: request.originalUrl,
    });
    return true;
  }

  private handleOversizedPermissionPath(method: string, path: string): boolean {
    const message = `Permission path exceeds max length (${path.length}/255): ${method} ${path}`;

    if (this.config.authz.strictMode) {
      throw new ForbiddenException(message);
    }

    this.logger.warn("Permission path was too long, but strict mode is off", {
      module: "authz",
      service: "AuthorizationGuard",
      operation: "handleOversizedPermissionPath",
      event: "AUTHORIZATION_BYPASSED",
      reason: "permission_path_too_long_strict_mode_off",
      method,
      path,
      pathLength: path.length,
    });
    return true;
  }
}
