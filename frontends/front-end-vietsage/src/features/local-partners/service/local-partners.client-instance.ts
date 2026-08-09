import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import { LocalPartnersClientService } from "./local-partners.client";

export const localPartnersServerClient = new LocalPartnersClientService(
  new HttpClient({ baseUrl: getBackendApiBaseUrl() }),
);
