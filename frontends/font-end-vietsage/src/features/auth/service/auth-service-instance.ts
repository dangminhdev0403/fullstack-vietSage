import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { createAuthService } from "@/features/auth/service/auth-service";

export const authService = createAuthService({
  baseUrl: getBackendApiBaseUrl(),
});
