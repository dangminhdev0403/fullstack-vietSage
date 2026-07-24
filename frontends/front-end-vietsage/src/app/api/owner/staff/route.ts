import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../_utils";

export const dynamic = "force-dynamic";

const createUserSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2),
  password: z.string().min(8),
  roleIds: z.array(z.string().trim().min(1)).min(1),
  hotelId: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  const query = new URL(request.url).searchParams;
  const hotelId = query.get("hotelId")?.trim() || null;
  const q = query.get("q")?.trim() || undefined;
  const pageParam = query.get("page");
  const limitParam = query.get("limit");
  const page = pageParam ? Number.parseInt(pageParam, 10) : undefined;
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (!tenantId) return validationErrorResponse("tenantId là bắt buộc");
  try {
    const result = await executeOwnerBackendRequest("load owner staff directory", async (accessToken) => {
      const [usersPage, roles, assignments, hotelsPage] = await Promise.all([
        staffManagementService.listUsers({ tenantId, q, page, limit, accessToken }),
        staffManagementService.listManagedRoles(tenantId, accessToken),
        hotelId ? staffManagementService.listAssignments(hotelId, accessToken) : Promise.resolve(null),
        adminService.listHotels({ query: { page: 1, limit: 100, tenantId }, accessToken }),
      ]);
      let users = usersPage;
      if (hotelId && assignments) {
        const assignedUserIds = new Set(assignments.items.map((a) => a.userId));
        const filteredItems = usersPage.items.filter((u) => assignedUserIds.has(u.id));
        users = {
          ...usersPage,
          items: filteredItems,
          total: filteredItems.length,
        };
      }
      return { users, roles, assignments, hotels: hotelsPage.items.filter((h) => h.status !== "DISABLED") };
    });
    return result instanceof NextResponse ? result : successResponse(result);
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  if (!tenantId) return validationErrorResponse("tenantId là bắt buộc");
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin nhân viên chưa hợp lệ");
  try {
    const result = await executeOwnerBackendRequest("create and assign owner staff user", async (accessToken) => {
      const { hotelId, ...userInput } = parsed.data;
      const user = await staffManagementService.createUser(userInput, tenantId, accessToken);
      const assignment = await staffManagementService.assignHotel(hotelId, user.id, accessToken);
      return { user, assignment };
    });
    return result instanceof NextResponse
      ? result
      : successResponse(result, 201, "Đã tạo và phân công nhân viên");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
