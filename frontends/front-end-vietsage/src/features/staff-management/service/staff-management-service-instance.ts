import "server-only";

import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { StaffManagementService } from "./staff-management-service";

export const staffManagementService = new StaffManagementService({
  baseUrl: getBackendApiBaseUrl(),
});
