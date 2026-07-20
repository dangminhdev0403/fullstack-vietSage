import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../_utils";

export const dynamic = "force-dynamic";

const createUserSchema = z.object({
  tenantId: z.string().trim().min(1),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2),
  password: z.string().min(8),
  roleIds: z.array(z.string().trim().min(1)).min(1),
});

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const tenantId = query.get("tenantId")?.trim();
  const hotelId = query.get("hotelId")?.trim() || null;
  if (!tenantId) return validationErrorResponse("tenantId là bắt buộc");
  try {
    const [users, roles, assignments] = await Promise.all([
      staffManagementService.listUsers({ tenantId }),
      staffManagementService.listManagedRoles(tenantId),
      hotelId ? staffManagementService.listAssignments(hotelId) : Promise.resolve(null),
    ]);
    return successResponse({ users, roles, assignments });
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin nhân viên chưa hợp lệ");
  try {
    const data = await staffManagementService.createUser(parsed.data);
    return successResponse(data, 201, "Đã tạo nhân viên");
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
