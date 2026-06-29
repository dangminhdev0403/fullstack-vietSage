import { HttpError } from "@/core/http/http-error";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../admin/_utils";

export const dynamic = "force-dynamic";

type CreateRolePayload = {
  code?: unknown;
  name?: unknown;
  description?: unknown;
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export async function POST(request: Request) {
  let payload: CreateRolePayload | null = null;
  try {
    payload = (await request.json()) as CreateRolePayload;
  } catch {
    payload = null;
  }

  const code = normalizeOptionalString(payload?.code);
  const name = normalizeOptionalString(payload?.name);
  const description = normalizeOptionalString(payload?.description);

  if (!name) {
    return validationErrorResponse("name is required");
  }

  try {
    const data = await rbacService.createRole(
      {
        name,
        ...(code ? { code } : {}),
        ...(description ? { description } : {}),
      },
    );

    return successResponse(data, 201, "Role created successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
