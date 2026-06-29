import { SetMetadata } from "@nestjs/common";
import type { BusinessPermissionKey } from "../../common/config/business-permissions.registry";

export const REQUIRED_PERMISSION_KEY = "required_permission_key";

export function RequirePermission(permissionKey: BusinessPermissionKey) {
  return SetMetadata(REQUIRED_PERMISSION_KEY, permissionKey);
}
