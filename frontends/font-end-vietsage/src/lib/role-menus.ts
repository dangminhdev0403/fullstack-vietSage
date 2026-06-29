import { rbacService } from "@/features/rbac/service/rbac-service-instance";

export async function getCurrentRoleMenus(options: {
  accessToken: string;
  refreshToken?: string | null;
}): Promise<string[]> {
  return rbacService.listRoleMenus({
    accessToken: options.accessToken,
  });
}
