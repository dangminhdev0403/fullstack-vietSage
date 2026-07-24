import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { ListHotelRequestsQuery } from "@/features/hotel-ops/types/hotel-ops-contract";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

import { RequestQueueClient } from "../../../../../hotels/[hotelId]/requests/request-queue-client";

type PageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDayFilter(value: string | undefined, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!displayMatch) return trimmed;

  return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
}

export default async function OwnerHotelRequestsPage({ params, searchParams }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const session = await auth();
    const callbackUrl = `/owner/hotels/${hotelId}/requests` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
      const currentPage = getPositiveInt(getFirst(resolvedSearchParams.page), 1);
  const currentPageSize = getPositiveInt(getFirst(resolvedSearchParams.limit), 20);

  const query: ListHotelRequestsQuery = {
    page: currentPage,
    limit: currentPageSize,
    roomNumber: getFirst(resolvedSearchParams.roomNumber),
    serviceItemId: getFirst(resolvedSearchParams.serviceItemId),
    priority: getFirst(resolvedSearchParams.priority) as ListHotelRequestsQuery["priority"],
    status: getFirst(resolvedSearchParams.status) as ListHotelRequestsQuery["status"],
    assignedToUserId: getFirst(resolvedSearchParams.assignedToUserId),
    from: normalizeDayFilter(getFirst(resolvedSearchParams.from), "start"),
    to: normalizeDayFilter(getFirst(resolvedSearchParams.to), "end"),
  };

  const summaryQuery = {
    roomNumber: query.roomNumber,
    serviceItemId: query.serviceItemId,
    priority: query.priority,
    assignedToUserId: query.assignedToUserId,
  };

  const [requestsPage, requestSummary, serviceItemsPage] = await Promise.all([
    authorizedApi("list owner hotel requests", (accessToken) => hotelOpsService.listRequests(hotelId, { query, accessToken })),
    authorizedApi("summarize owner hotel requests", (accessToken) => hotelOpsService.getRequestsSummary(hotelId, { query: summaryQuery, accessToken })),
    authorizedApi("list owner request service items", (accessToken) => hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
  ]);

  const initialFilters = Object.fromEntries(
    ["status", "roomNumber", "serviceItemId", "priority", "assignedToUserId", "from", "to"].map((key) => [key, getFirst(resolvedSearchParams[key]) ?? ""]),
  );

  return (
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">YÊU CẦU</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">Yêu cầu của khách</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Theo dõi yêu cầu dịch vụ, trạng thái xử lý, phân công nhân sự và lịch sử phản hồi trong khách sạn.
        </p>
      </header>

      <RequestQueueClient
        hotelId={hotelId}
        requests={requestsPage.items}
        total={requestsPage.total}
        summary={requestSummary}
        serviceItems={serviceItemsPage.items}
        initialFilters={initialFilters}
        basePath={`/owner/hotels/${hotelId}/requests`}
        serviceCatalogPath={`/owner/hotels/${hotelId}/services`}
        ownerApiBasePath={`/api/owner/hotels/${hotelId}/requests`}
        detailMode="modal"
        initialDetailRequestId={getFirst(resolvedSearchParams.requestId)}
        page={requestsPage.page}
        pageSize={requestsPage.limit}
        pageSizeOptions={[10, 20, 50]}
        labels={{
          allStatuses: "Tất cả trạng thái",
          roomNumberPlaceholder: "Số phòng",
          allServiceItems: "Tất cả dịch vụ",
          assignedUserIdPlaceholder: "ID nhân sự phụ trách",
          filterButton: "Lọc",
          requestCountSuffix: "yêu cầu",
          manageCatalog: "Quản lý dịch vụ",
          room: "Phòng",
          guest: "Khách",
          service: "Dịch vụ",
          category: "Danh mục",
          quantity: "Số lượng",
          priority: "Ưu tiên",
          status: "Trạng thái",
          assigned: "Phụ trách",
          created: "Ngày tạo",
          unassigned: "Chưa phân công",
          emptyState: "Không có yêu cầu phù hợp với bộ lọc hiện tại.",
          closeDetail: "Đóng",
          requestDetail: "Chi tiết yêu cầu",
          reservationCode: "Mã đặt phòng",
          details: "Ghi chú khách hàng",
          actionNote: "Ghi chú gửi cho khách",
          assignmentNote: "Ghi chú phân công",
          timelineNote: "Ghi chú tiến trình",
          staffUserId: "ID nhân sự",
          statusActions: "Xử lý trạng thái",
          assignment: "Phân công nhân sự",
          timeline: "Dòng thời gian",
          saveAssignment: "Lưu phân công",
          unassign: "Bỏ phân công",
          noTimeline: "Chưa có sự kiện tiến trình.",
          guestVisibleNoteHelp: "Ghi chú khi đổi trạng thái sẽ hiển thị cho khách trong câu trả lời yêu cầu.",
          openRequest: "Mở yêu cầu",
          loadingDetail: "Đang tải chi tiết yêu cầu...",
          operationError: "Không thể cập nhật yêu cầu này.",
        }}
      />
    </>
  );
}
