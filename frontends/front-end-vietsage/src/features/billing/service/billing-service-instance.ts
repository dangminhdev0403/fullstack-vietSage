import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { createBillingService } from "@/features/billing/service/billing-service";

export const billingService = createBillingService({
  baseUrl: getBackendApiBaseUrl(),
});
