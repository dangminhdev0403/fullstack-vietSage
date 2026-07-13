import { createHotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

export const hotelOpsService = createHotelOpsService({
  baseUrl: getBackendApiBaseUrl(),
});
