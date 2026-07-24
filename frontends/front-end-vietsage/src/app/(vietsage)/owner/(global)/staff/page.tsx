import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { StaffManagementClient } from "@/features/staff-management/components/staff-management-client";
import { hasWorkspaceCapability } from "@/features/workspace/utils/workspace-context";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function OwnerStaffPage({ searchParams }: Props) {
  const callbackUrl = "/owner/staff" as const;
  const session = await auth();
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const context = await loadServerWorkspaceContext(callbackUrl);
  if (!hasWorkspaceCapability(context, "hotel.staff.view") && !hasWorkspaceCapability(context, "hotel.staff.manage")) {
    notFound();
  }
  const params = await Promise.resolve(searchParams ?? {});
  const requestedTenantId = first(params.tenantId);
  const tenantId = context.tenants.some((tenant) => tenant.id === requestedTenantId)
    ? requestedTenantId
    : context.tenants.length === 1
      ? context.tenants[0].id
      : null;
  const hotels = tenantId
    ? (await authorizedApi("list owner hotels for staff management", (accessToken) =>
        adminService.listHotels({ query: { page: 1, limit: 100, tenantId }, accessToken }),
      )).items.filter((hotel) => hotel.status !== "DISABLED")
    : [];
  const requestedHotelId = first(params.hotelId);
  const hotelId = hotels.some((hotel) => hotel.id === requestedHotelId) ? requestedHotelId : null;

  return (
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">NHÂN SỰ KHÁCH SẠN</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">Nhân viên & phân công</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Tạo tài khoản, gán vai trò nghiệp vụ và chỉ định một khách sạn làm việc cho mỗi nhân viên.
        </p>
      </header>
      {context.tenants.length > 1 ? (
        <form className="flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-5 md:flex-row md:items-end" method="GET">
          <label className="flex-1 text-sm font-semibold text-[var(--primary)]">
            Đơn vị
            <select name="tenantId" defaultValue={tenantId ?? ""} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white px-3 font-normal">
              <option value="">Chọn đơn vị để quản lý đúng phạm vi</option>
              {context.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.code} · {tenant.name}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-white">Mở phạm vi</button>
        </form>
      ) : null}
      {tenantId ? (
        <StaffManagementClient
          scope={{ surface: "owner", tenantId }}
          canManage={hasWorkspaceCapability(context, "hotel.staff.manage")}
          initialHotelId={hotelId}
          onHotelPath="/owner/staff"
        />
      ) : (
        <div className="rounded-xl bg-[var(--surface-container-low)] p-8 text-center text-sm text-[var(--on-surface-variant)]">
          Chọn đơn vị trước; hệ thống sẽ không tải nhân viên khi chưa có phạm vi.
        </div>
      )}
    </>
  );
}
