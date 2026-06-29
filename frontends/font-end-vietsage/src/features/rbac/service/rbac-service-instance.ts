import { createRbacService } from "@/features/rbac/service/rbac-service";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

export const rbacService = createRbacService({
  baseUrl: getBackendApiBaseUrl(),
});
