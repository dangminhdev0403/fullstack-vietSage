import { notFound } from "next/navigation";
import { StaffManagementClient } from "@/features/staff-management/components/staff-management-client";
import { hasWorkspaceCapability } from "@/features/workspace/utils/workspace-context";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type Props = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OwnerHotelStaffPage({ params }: Props) {
  const { hotelId } = await params;
  const callbackUrl = `/owner/hotels/${encodeURIComponent(hotelId)}/staff` as const;
  const context = await loadServerWorkspaceContext(callbackUrl);

  if (
    !hasWorkspaceCapability(context, "hotel.staff.view") &&
    !hasWorkspaceCapability(context, "hotel.staff.manage")
  ) {
    notFound();
  }

  const hotel = context.accessibleHotels.find((h) => h.id === hotelId);
  const tenantId = hotel?.tenantId ?? context.tenants[0]?.id ?? null;

  return (
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
          NHÂN SỰ KHÁCH SẠN
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">
          Nhân viên &amp; phân công
        </h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Tạo tài khoản, gán vai trò nghiệp vụ và chỉ định một khách sạn làm việc cho mỗi nhân viên.
        </p>
      </header>

      <section className="mt-6">
        {tenantId ? (
          <StaffManagementClient
            scope={{ surface: "owner", tenantId }}
            canManage={hasWorkspaceCapability(context, "hotel.staff.manage")}
            initialHotelId={hotelId}
            onHotelPath={`/owner/hotels/${encodeURIComponent(hotelId)}/staff`}
          />
        ) : (
          <div className="rounded-xl bg-[var(--surface-container-low)] p-8 text-center text-sm text-[var(--on-surface-variant)]">
            Không tìm thấy thông tin đơn vị quản lý khách sạn này.
          </div>
        )}
      </section>
    </>
  );
}
