import { createAdminService } from "@/features/admin/service/admin-service";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

export const adminService = createAdminService({
  baseUrl: getBackendApiBaseUrl(),
});
