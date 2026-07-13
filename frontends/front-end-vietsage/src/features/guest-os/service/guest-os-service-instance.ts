import { createGuestOsService } from "@/features/guest-os/service/guest-os-service";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

const isBrowser = typeof window !== "undefined";

export const guestOsService = createGuestOsService({
  baseUrl: isBrowser ? window.location.origin : getBackendApiBaseUrl(),
  pathPrefix: isBrowser ? "/api" : undefined,
});
