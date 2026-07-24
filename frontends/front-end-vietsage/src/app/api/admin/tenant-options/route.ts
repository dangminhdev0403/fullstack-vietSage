import { auth } from "@/auth";
import { unstable_rethrow } from "next/navigation";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
} from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    const executeAuthorizedApi = createAuthorizedApiExecutor({
      session,
      callbackUrl: "/admin/users",
    });
    const tenantOptions = await executeAuthorizedApi(
      "GET /tenant-owners/tenant-options",
      (accessToken) => adminService.listTenantOptions(accessToken),
    );
    return successResponse(tenantOptions);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
