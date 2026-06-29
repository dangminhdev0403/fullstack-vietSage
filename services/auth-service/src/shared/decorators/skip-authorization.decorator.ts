import { SetMetadata } from "@nestjs/common";

export const SKIP_AUTHORIZATION_KEY = "skipAuthorization";

export const SkipAuthorization = () => SetMetadata(SKIP_AUTHORIZATION_KEY, true);
