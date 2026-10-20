import { SetMetadata } from "@nestjs/common";

export const REQUIRED_ACTIVE_ROLE_KEY = "required_active_role_key";
export const CANONICAL_OWNER_ROLE = "TENANT_OWNER";

export function RequireActiveRole(roleCode: string | string[], ...additionalRoleCodes: string[]) {
  const roles = Array.isArray(roleCode) ? roleCode : [roleCode, ...additionalRoleCodes];
  return SetMetadata(REQUIRED_ACTIVE_ROLE_KEY, roles.length === 1 ? roles[0] : roles);
}
