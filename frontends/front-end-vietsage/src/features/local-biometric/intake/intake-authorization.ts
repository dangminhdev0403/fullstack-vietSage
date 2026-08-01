export function resolveIntakeAuthorizationMode(activeRoleCode: string | null | undefined) {
  return activeRoleCode === "TENANT_OWNER" ? "owner-backend" : "hotel-workspace";
}
