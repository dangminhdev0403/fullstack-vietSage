import { SetMetadata } from "@nestjs/common";

export const API_DESCRIPTION_KEY = "api_description";

export const ApiDescript = (description: string) => SetMetadata(API_DESCRIPTION_KEY, description);
