import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../_utils";

export const dynamic = "force-dynamic";

const createTenantOwnerSchema = z.object({
  owner: z.object({
    fullName: z.string().trim().min(2, "Họ tên cần ít nhất 2 ký tự."),
    email: z.string().trim().email("Email không hợp lệ."),
    password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự."),
  }),
  tenant: z.object({
    name: z.string().trim().min(2, "Tên tổ chức cần ít nhất 2 ký tự."),
  }),
});

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  const parsed = createTenantOwnerSchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse(formatValidationIssues(parsed.error));
  }

  try {
    const data = await adminService.createTenantOwner(
      {
        owner: {
          fullName: parsed.data.owner.fullName.trim(),
          email: parsed.data.owner.email.trim().toLowerCase(),
          password: parsed.data.owner.password,
        },
        tenant: {
          name: parsed.data.tenant.name.trim(),
        },
      },
    );

    return successResponse(data, 201, "Tenant owner created successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
