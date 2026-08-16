"use client";

import {
  type FormEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Swal from "sweetalert2";
import { toast } from "sonner";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSortDirection,
} from "@/components/ui/data-table";
import { HttpError } from "@/core/http/http-error";
import { requestInternalApi } from "@/core/http/internal-api-client";
import type { GuestRequestStatus } from "@/features/guest-os/types/guest-os-contract";
import type {
  HotelGuestRequest,
  HotelServiceItem,
  StaffRequestAction,
  StaffRequestListItem,
  StaffRequestSummaryResponse,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { hotelRequestStatuses } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  formatOpsDateTime,
  getRequestTitle,
  priorityTone,
  requestPriorityLabelMap,
  requestStatusLabelMap,
  statusTone,
} from "@/features/hotel-ops/utils/hotel-ops-display";
import { requestQueueResource } from "@/features/hotel-ops/resources/request-queue-resource";
import { useNearbyServiceProviders } from "@/features/local-partners/queries/use-local-partners";
import type { HotelMarketplaceOrder } from "@/features/local-partners/types/local-partners-contract";
import {
  calculateOrderFinancials,
  getCanonicalOrderItems,
  isTerminalOrderStatus,
} from "@/features/marketplace/utils/marketplace-unit";
import { printMarketplaceVoucherTicket } from "@/features/marketplace/utils/print-voucher";
import { SwalVietSage } from "@/libs/swal";

type RequestQueueLabels = {
  allStatuses: string;
  roomNumberPlaceholder: string;
  allServiceItems: string;
  assignedUserIdPlaceholder: string;
  filterButton: string;
  requestCountSuffix: string;
  manageCatalog: string;
  room: string;
  guest: string;
  service: string;
  category: string;
  quantity: string;
  priority: string;
  status: string;
  assigned: string;
  created: string;
  unassigned: string;
  emptyState: string;
  closeDetail: string;
  requestDetail: string;
  reservationCode: string;
  details: string;
  actionNote: string;
  assignmentNote: string;
  timelineNote: string;
  staffUserId: string;
  statusActions: string;
  assignment: string;
  timeline: string;
  saveAssignment: string;
  unassign: string;
  noTimeline: string;
  guestVisibleNoteHelp: string;
  openRequest: string;
  loadingDetail: string;
  operationError: string;
};

type RequestQueueClientProps = {
  hotelId: string;
  requests: StaffRequestListItem[];
  total: number;
  summary: StaffRequestSummaryResponse;
  serviceItems: HotelServiceItem[];
  initialFilters: Record<string, string>;
  basePath?: string;
  serviceCatalogPath?: string;
  ownerApiBasePath?: string;
  labels?: Partial<RequestQueueLabels>;
  detailMode?: "page" | "modal";
  initialDetailRequestId?: string;
  page?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
};

const defaultLabels: RequestQueueLabels = {
  allStatuses: "Tất cả trạng thái",
  roomNumberPlaceholder: "Số phòng",
  allServiceItems: "Tất cả dịch vụ",
  assignedUserIdPlaceholder: "Mã nhân viên phụ trách",
  filterButton: "Lọc",
  requestCountSuffix: "yêu cầu",
  manageCatalog: "Quản lý dịch vụ",
  room: "Phòng",
  guest: "Khách hàng",
  service: "Dịch vụ",
  category: "Danh mục",
  quantity: "SL",
  priority: "Độ ưu tiên",
  status: "Trạng thái",
  assigned: "Phụ trách",
  created: "Ngày tạo",
  unassigned: "Chưa phân công",
  emptyState: "Hiện chưa có yêu cầu dịch vụ nào phù hợp.",
  closeDetail: "Đóng",
  requestDetail: "Chi tiết yêu cầu",
  reservationCode: "Mã đặt phòng",
  details: "Ghi chú khách hàng",
  actionNote: "Ghi chú gửi khách hàng",
  assignmentNote: "Ghi chú phân công",
  timelineNote: "Ghi chú nhật ký",
  staffUserId: "Mã nhân viên",
  statusActions: "Thao tác",
  assignment: "Phân công xử lý",
  timeline: "Nhật ký tiến trình",
  saveAssignment: "Lưu phân công",
  unassign: "Bỏ phân công",
  noTimeline: "Chưa có sự kiện tiến trình nào.",
  guestVisibleNoteHelp: "Ghi chú sẽ hiển thị Realtime tới khách hàng.",
  openRequest: "Mở yêu cầu",
  loadingDetail: "Đang tải chi tiết yêu cầu...",
  operationError: "Không thể cập nhật yêu cầu này.",
};

const actionMeta: Record<
  StaffRequestAction,
  {
    label: string;
    status: GuestRequestStatus;
    note: string;
    icon: string;
    className: string;
  }
> = {
  ACCEPT: {
    label: "Tiếp nhận",
    status: "ACKNOWLEDGED",
    note: "Chúng tôi đã tiếp nhận yêu cầu.",
    icon: "check",
    className:
      "border border-blue-200/80 bg-blue-50/80 text-blue-700 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
  },
  START: {
    label: "Bắt đầu",
    status: "IN_PROGRESS",
    note: "Nhân sự phụ trách đang trên đường hỗ trợ.",
    icon: "arrow_forward",
    className:
      "border border-indigo-200/80 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60",
  },
  COMPLETE: {
    label: "Hoàn thành",
    status: "COMPLETED",
    note: "Yêu cầu của quý khách đã được hoàn thành.",
    icon: "task_alt",
    className:
      "border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
  },
  CANCEL: {
    label: "Hủy",
    status: "CANCELLED",
    note: "Rất tiếc, dịch vụ này hiện chưa khả dụng.",
    icon: "close",
    className:
      "border border-rose-200/80 bg-rose-50/80 text-rose-700 hover:bg-rose-100 hover:border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
  },
  FAIL: {
    label: "Đánh dấu thất bại",
    status: "FAILED",
    note: "Chúng tôi chưa thể hoàn tất yêu cầu này.",
    icon: "block",
    className:
      "border border-slate-200 bg-slate-100/90 text-slate-700 hover:bg-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
};

const statusActions: Record<GuestRequestStatus, StaffRequestAction[]> = {
  CREATED: ["ACCEPT", "CANCEL"],
  ACKNOWLEDGED: ["COMPLETE", "FAIL"],
  IN_PROGRESS: ["COMPLETE", "FAIL"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

function getExternalOrderStatusLabel(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "PENDING":
      return {
        label: "Đang chờ xác nhận",
        className: "bg-amber-100 text-amber-900 border-amber-300",
      };
    case "CONFIRMED":
    case "ACCEPTED":
      return {
        label: "Đối tác đã xác nhận",
        className: "bg-blue-100 text-blue-900 border-blue-300",
      };
    case "PREPARING":
      return {
        label: "Đang chuẩn bị",
        className: "bg-indigo-100 text-indigo-900 border-indigo-300",
      };
    case "DELIVERING":
      return {
        label: "Đang giao phòng",
        className: "bg-cyan-100 text-cyan-900 border-cyan-300",
      };
    case "READY":
      return {
        label: "Sẵn sàng phục vụ",
        className: "bg-cyan-100 text-cyan-900 border-cyan-300",
      };
    case "COMPLETED":
      return {
        label: "Hoàn thành",
        className: "bg-emerald-100 text-emerald-900 border-emerald-300",
      };
    case "CANCELLED":
    case "REJECTED":
      return {
        label: "Đã hủy",
        className: "bg-rose-100 text-rose-900 border-rose-300",
      };
    default:
      return {
        label: status,
        className: "bg-slate-100 text-slate-800 border-slate-300",
      };
  }
}

const swalButtonColor = "#00003c";

function formatDayFilterValue(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed);
  if (!isoMatch) return trimmed;

  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
}

function toFilterState(
  initialFilters: Record<string, string>,
): Record<string, string> {
  return {
    ...initialFilters,
    from: formatDayFilterValue(initialFilters.from),
    to: formatDayFilterValue(initialFilters.to),
  };
}

function getHttpErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpError)) return fallback;
  const data = error.data;
  if (data && typeof data === "object" && "data" in data) {
    const detail = (data as { data?: { detail?: unknown } }).data?.detail;
    if (typeof detail === "string") return detail;
  }

  return error.message;
}

type RequestSortKey =
  | "room"
  | "guest"
  | "service"
  | "category"
  | "quantity"
  | "priority"
  | "status"
  | "assigned"
  | "created";

const prioritySortWeight: Record<StaffRequestListItem["priority"], number> = {
  URGENT: 1,
  NORMAL: 2,
};

const statusSortWeight: Record<GuestRequestStatus, number> = {
  CREATED: 1,
  ACKNOWLEDGED: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
  CANCELLED: 5,
  FAILED: 6,
};

function compareValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getSortableRequestValue(
  request: StaffRequestListItem,
  key: RequestSortKey,
): string | number {
  switch (key) {
    case "room":
      return request.roomNumber;
    case "guest":
      return request.guestName ?? "";
    case "service":
      return request.displayName;
    case "category":
      return request.categoryName ?? "";
    case "quantity":
      return request.quantity;
    case "priority":
      return prioritySortWeight[request.priority];
    case "status":
      return statusSortWeight[request.status];
    case "assigned":
      return request.assignedToName ?? "";
    case "created":
      return new Date(request.createdAt).getTime();
  }
}

function isCheckedOutRequest(
  request: Partial<Pick<StaffRequestListItem, "checkedOutAt" | "stayStatus">>,
): boolean {
  return Boolean(request.checkedOutAt) || request.stayStatus === "CHECKED_OUT";
}

function requestToListItem(request: HotelGuestRequest): StaffRequestListItem {
  return {
    id: request.id,
    displayName: getRequestTitle(request),
    status: request.status,
    priority: request.priority,
    quantity: 1,
    description: request.details,
    latestNote: null,
    createdAt: request.createdAt,
    roomNumber: request.room?.roomNumber ?? "-",
    guestName: request.stay?.guestDisplayName ?? null,
    categoryName: request.serviceItem?.category?.name ?? null,
    assignedToName:
      request.assignedToUser?.name ?? request.assignedToUserId ?? null,
    stayStatus: request.stay?.status ?? undefined,
    checkedOutAt: request.stay?.checkedOutAt ?? undefined,
    actions: statusActions[request.status] ?? [],
  };
}

export function RequestQueueClient({
  hotelId,
  requests,
  total,
  initialFilters,
  basePath = `/hotels/${hotelId}/requests`,
  serviceCatalogPath = `/hotels/${hotelId}/services`,
  ownerApiBasePath,
  labels,
  page,
  pageSize,
  pageSizeOptions = [10, 20, 50],
}: RequestQueueClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mergedLabels = { ...defaultLabels, ...labels };
  const requestQueue = requestQueueResource.bind({
    basePath: ownerApiBasePath ?? "",
  });
  const [filters, setFilters] = useState(() => toFilterState(initialFilters));
  const [sortState, setSortState] = useState<{
    key: RequestSortKey;
    direction: DataTableSortDirection;
  }>({ key: "created", direction: "desc" });
  const [liveRequestChanges, setLiveRequestChanges] = useState<
    Record<string, Partial<StaffRequestListItem> & { id: string }>
  >({});
  const [inboxTab, setInboxTab] = useState<
    "HOTEL_REQUESTS" | "EXTERNAL_ORDERS" | "ALL"
  >("HOTEL_REQUESTS");
  const [externalPage, setExternalPage] = useState(1);
  const [externalPageSize, setExternalPageSize] = useState(10);
  const [hotelPage, setHotelPage] = useState(1);
  const [hotelPageSize, setHotelPageSize] = useState(10);

  useEffect(() => {
    startTransition(() => {
      setFilters(toFilterState(initialFilters));
    });
  }, [initialFilters]);

  const applyLiveRequestChange = useCallback(
    (request: Partial<StaffRequestListItem> & { id: string }) => {
      setLiveRequestChanges((currentChanges) => ({
        ...currentChanges,
        [request.id]: {
          ...currentChanges[request.id],
          ...request,
        },
      }));
    },
    [],
  );

  const { orders: externalOrdersQuery } = useNearbyServiceProviders(hotelId);
  const externalOrders = useMemo(
    () => externalOrdersQuery.data ?? [],
    [externalOrdersQuery.data],
  );

  const convertedExternalOrders = useMemo<StaffRequestListItem[]>(() => {
    return externalOrders.map((order) => {
      const statusMap: Record<string, GuestRequestStatus> = {
        PENDING: "CREATED",
        CONFIRMED: "ACKNOWLEDGED",
        PROCESSING: "IN_PROGRESS",
        ACCEPTED: "ACKNOWLEDGED",
        PREPARING: "IN_PROGRESS",
        DELIVERING: "IN_PROGRESS",
        READY: "IN_PROGRESS",
        COMPLETED: "COMPLETED",
        CANCELLED: "CANCELLED",
        REJECTED: "FAILED",
      };
      const status: GuestRequestStatus = statusMap[order.status] ?? "CREATED";
      const actions = statusActions[status] ?? [];

      return {
        id: order.id,
        displayName: `${order.serviceNameSnapshot} (${order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác"})`,
        status,
        priority: "NORMAL",
        quantity: order.quantity,
        description: order.guestNote ?? null,
        latestNote: `Mã đơn: ${order.orderNumber} · Tổng tiền: ${Number(order.totalAmount).toLocaleString("vi-VN")} ${order.currency}`,
        createdAt: order.createdAt,
        roomNumber: order.stay?.room?.roomNumber ?? "-",
        guestName: order.stay?.guestDisplayName ?? "Khách lưu trú",
        categoryName: "Dịch vụ ngoài khách sạn",
        assignedToName: "Đối tác ngoài",
        stayStatus: undefined,
        checkedOutAt: undefined,
        actions,
      };
    });
  }, [externalOrders]);

  const displayedRequests = useMemo(() => {
    const byId = new Map<string, StaffRequestListItem>(
      requests.map((request) => [request.id, request]),
    );

    for (const request of Object.values(liveRequestChanges)) {
      const existing = byId.get(request.id);
      const nextStatus = request.status ?? existing?.status;
      const nextActions = nextStatus
        ? (statusActions[nextStatus] ?? [])
        : (existing?.actions ?? []);
      byId.set(
        request.id,
        existing
          ? { ...existing, ...request, actions: nextActions }
          : { ...(request as StaffRequestListItem), actions: nextActions },
      );
    }

    let allItems = [...byId.values()];

    if (filters.status) {
      allItems = allItems.filter((item) => item.status === filters.status);
    }

    return allItems.sort((leftRequest, rightRequest) => {
      const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
      const result = compareValues(
        getSortableRequestValue(leftRequest, sortState.key),
        getSortableRequestValue(rightRequest, sortState.key),
      );

      return result * directionMultiplier;
    });
  }, [filters.status, liveRequestChanges, requests, sortState]);

  const activeTabRequests = useMemo(() => {
    let list: StaffRequestListItem[] = [];
    if (inboxTab === "HOTEL_REQUESTS") {
      list = displayedRequests;
    } else if (inboxTab === "EXTERNAL_ORDERS") {
      list = convertedExternalOrders;
    } else {
      list = [...displayedRequests, ...convertedExternalOrders];
    }

    if (filters.status) {
      list = list.filter((item) => item.status === filters.status);
    }
    if (filters.roomNumber) {
      const q = filters.roomNumber.toLowerCase();
      list = list.filter((item) => item.roomNumber.toLowerCase().includes(q));
    }
    if (filters.priority) {
      list = list.filter((item) => item.priority === filters.priority);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(
        (item) =>
          item.roomNumber.toLowerCase().includes(q) ||
          (item.guestName ?? "").toLowerCase().includes(q) ||
          item.displayName.toLowerCase().includes(q) ||
          (item.latestNote ?? "").toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => {
      const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
      const result = compareValues(
        getSortableRequestValue(a, sortState.key),
        getSortableRequestValue(b, sortState.key),
      );
      return result * directionMultiplier;
    });
  }, [
    inboxTab,
    displayedRequests,
    convertedExternalOrders,
    filters,
    sortState,
  ]);

  const activeSummaryCounts = useMemo(() => {
    const counts: Record<GuestRequestStatus, number> = {
      CREATED: 0,
      ACKNOWLEDGED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      FAILED: 0,
    };
    const list =
      inboxTab === "HOTEL_REQUESTS"
        ? requests
        : inboxTab === "EXTERNAL_ORDERS"
          ? convertedExternalOrders
          : [...requests, ...convertedExternalOrders];

    list.forEach((item) => {
      if (item.status && counts[item.status] !== undefined) {
        counts[item.status] += 1;
      }
    });
    return counts;
  }, [inboxTab, requests, convertedExternalOrders]);

  function openRequestRow(request: StaffRequestListItem) {
    router.push(`${basePath}/${request.id}`);
  }

  function syncUpdatedRequest(updated: HotelGuestRequest) {
    const listItem = requestToListItem(updated);
    applyLiveRequestChange(listItem);
    queryClient
      .invalidateQueries({ queryKey: ["hotel-ops", hotelId] })
      .catch(() => {});
    queryClient
      .invalidateQueries({ queryKey: ["hotel-requests", hotelId] })
      .catch(() => {});
    queryClient
      .invalidateQueries({ queryKey: ["owner-requests", hotelId] })
      .catch(() => {});
    startTransition(() => {
      router.refresh();
    });
  }

  const statusMutation = useMutation(
    requestQueue.mutations.status.options({
      onSuccess: ({ data: updated }) => {
        syncUpdatedRequest(updated);
        toast.success("Đã cập nhật trạng thái yêu cầu thành công");
      },
      onError: (error) => {
        const message = getHttpErrorMessage(error, mergedLabels.operationError);
        toast.error(message);
      },
    }),
  );

  const assignmentMutation = useMutation(
    requestQueue.mutations.assignment.options({
      onSuccess: ({ data: updated }) => {
        syncUpdatedRequest(updated);
        void Swal.fire({
          icon: "success",
          title: "Đã cập nhật phân công",
          timer: 1300,
          showConfirmButton: false,
        });
      },
      onError: (error) => {
        const message = getHttpErrorMessage(error, mergedLabels.operationError);
        void Swal.fire({
          icon: "error",
          title: "Không thể cập nhật phân công",
          text: message,
          confirmButtonColor: swalButtonColor,
        });
      },
    }),
  );
  const isMutating = statusMutation.isPending || assignmentMutation.isPending;

  function updateFilter(key: string, value: string) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    pushFilters(nextFilters);
  }

  function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
  }

  function resetFilters() {
    const nextFilters: Record<string, string> = {};
    setFilters(nextFilters);
    pushFilters(nextFilters);
  }

  function pushFilters(nextFilters: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    }
    if (pageSize) {
      params.set("limit", String(pageSize));
    }
    router.push(`${basePath}${params.size ? `?${params.toString()}` : ""}`);
  }

  function getPaginationHref(nextPage: number, nextPageSize = pageSize) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    }
    params.set("page", String(nextPage));
    if (nextPageSize) {
      params.set("limit", String(nextPageSize));
    }
    return `${basePath}?${params.toString()}`;
  }

  function applyStatusFilter(status: GuestRequestStatus) {
    const nextFilters = {
      ...filters,
      status: filters.status === status ? "" : status,
    };
    setFilters(nextFilters);
    pushFilters(nextFilters);
  }

  async function updateStatusForRequest(
    targetRow: StaffRequestListItem,
    action: StaffRequestAction,
  ) {
    if (!ownerApiBasePath) return;

    const meta = actionMeta[action];
    const note = meta.note;

    const confirmation = await Swal.fire({
      icon:
        meta.status === "CANCELLED" || meta.status === "FAILED"
          ? "warning"
          : "question",
      title: `${meta.label} yêu cầu phòng ${targetRow.roomNumber}?`,
      text: "Xác nhận cập nhật trạng thái yêu cầu của phòng này.",
      showCancelButton: true,
      confirmButtonText: "Xác nhận",
      cancelButtonText: "Hủy",
      confirmButtonColor: swalButtonColor,
    });

    if (!confirmation.isConfirmed) return;

    try {
      const updated = await requestInternalApi<HotelGuestRequest>(
        `${ownerApiBasePath}/${encodeURIComponent(targetRow.id)}/status`,
        {
          method: "PATCH",
          body: {
            status: meta.status,
            note,
          },
        },
      );
      syncUpdatedRequest(updated);
      toast.success(
        `Đã ${meta.label.toLowerCase()} yêu cầu phòng ${targetRow.roomNumber}`,
      );
    } catch (error) {
      const message = getHttpErrorMessage(error, mergedLabels.operationError);
      toast.error(message);
    }
  }

  const requestColumns: DataTableColumn<StaffRequestListItem>[] = [
    {
      key: "room",
      sortable: true,
      header: mergedLabels.room,
      cell: (request) => (
        <div className="font-bold text-[var(--primary)]">
          Phòng {request.roomNumber}
        </div>
      ),
    },
    {
      key: "guest",
      sortable: true,
      header: mergedLabels.guest,
      cell: (request) => (
        <div>
          <div className="font-semibold text-[var(--on-surface)]">
            <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              Khách:
            </span>
            {request.guestName ?? "Khách"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--on-surface-variant)]">
            {isCheckedOutRequest(request) ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                Đã checkout - không thể phục vụ
              </span>
            ) : null}
            <span className="max-w-xs truncate">
              {request.latestNote ?? request.description ?? "-"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "service",
      sortable: true,
      header: mergedLabels.service,
      cell: (request) => request.displayName,
    },
    {
      key: "priority",
      sortable: true,
      header: mergedLabels.priority,
      className: "whitespace-nowrap",
      cell: (request) => (
        <span
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ${priorityTone(request.priority)}`}
        >
          {requestPriorityLabelMap[request.priority]}
        </span>
      ),
    },
    {
      key: "status",
      sortable: true,
      header: mergedLabels.status,
      className: "whitespace-nowrap",
      cell: (request) => (
        <span
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ${statusTone(request.status)}`}
        >
          {requestStatusLabelMap[request.status]}
        </span>
      ),
    },
    {
      key: "assigned",
      sortable: true,
      header: mergedLabels.assigned,
      cell: (request) => request.assignedToName ?? mergedLabels.unassigned,
    },
    {
      key: "created",
      sortable: true,
      header: mergedLabels.created,
      cell: (request) => formatOpsDateTime(request.createdAt),
    },
    {
      key: "actions" as RequestSortKey,
      sortable: false,
      header: mergedLabels.statusActions,
      className: "whitespace-nowrap min-w-[210px]",
      cell: (request) => {
        const available =
          request.actions ?? statusActions[request.status] ?? [];
        if (!available.length || isCheckedOutRequest(request))
          return <span className="text-xs text-slate-400">-</span>;
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {available.map((action) => {
              const meta = actionMeta[action];
              return (
                <button
                  key={action}
                  type="button"
                  disabled={isMutating}
                  onClick={(e) => {
                    e.stopPropagation();
                    void updateStatusForRequest(request, action);
                  }}
                  className={`inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-150 shadow-2xs hover:shadow-xs active:scale-[0.97] disabled:opacity-50 ${meta.className}`}
                >
                  <VsIcon
                    name={meta.icon}
                    className="text-xs opacity-75 shrink-0"
                  />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        );
      },
    },
  ];

  async function acknowledgeExternalOrder(order: HotelMarketplaceOrder) {
    if (isTerminalOrderStatus(order.status)) {
      toast.error("Đơn hàng đã ở trạng thái kết thúc, không thể tiếp nhận.");
      return;
    }

    const items = getCanonicalOrderItems(order);
    const financials = calculateOrderFinancials(order, items);

    const itemsSummaryHtml = items
      .map(
        (it) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed #e2e8f0;font-size:12px">
        <span style="font-weight:600;color:#0f172a">${it.serviceName} <span style="color:#64748b">×${it.quantity}</span></span>
        <span style="font-weight:700;color:#334155">${(Number(it.unitPrice) * Number(it.quantity)).toLocaleString("vi-VN")} ${financials.currency}</span>
      </div>
    `,
      )
      .join("");

    const isConfirmed = await SwalVietSage.fire({
      title: `<span style="font-size:17px;font-weight:800;color:#0f172a">Xác nhận tiếp nhận đơn #${order.orderNumber}?</span>`,
      html: `
        <div style="text-align:left;font-size:13px;color:#334155;line-height:1.6;display:grid;gap:8px;padding-top:4px;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
            <p style="margin:0 0 4px 0;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Dịch vụ yêu cầu (${items.length}):</p>
            ${itemsSummaryHtml}
          </div>
          <p style="margin:0"><b>Đối tác:</b> ${order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác dịch vụ"}</p>
          <p style="margin:0"><b>Khách / Phòng:</b> Phòng ${order.stay?.room?.roomNumber ?? "-"} (${order.stay?.guestDisplayName ?? "Khách lưu trú"})</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;font-size:12px;display:grid;gap:2px">
            <div style="display:flex;justify-content:space-between"><span>Tạm tính đối tác:</span><b style="color:#1e293b">${financials.partnerSubtotal.toLocaleString("vi-VN")} ${financials.currency}</b></div>
            <div style="display:flex;justify-content:space-between"><span>Phí khách sạn (10%):</span><b style="color:#0284c7">+${financials.hotelFee.toLocaleString("vi-VN")} ${financials.currency}</b></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #86efac;padding-top:4px;margin-top:2px;font-size:13px"><span style="font-weight:700">Tổng thu khách:</span><b style="color:#047857">${financials.customerTotal.toLocaleString("vi-VN")} ${financials.currency}</b></div>
          </div>
          <div style="margin-top:6px;padding:10px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;font-size:12px;color:#065f46">
            ⚡ <b>Hệ thống sẽ tự động:</b><br/>
            • Tạo Mã phiếu dịch vụ (Voucher)<br/>
            • Gửi thông báo Realtime trực tiếp tới Đối tác & Khách hàng.
          </div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "✓ Tiếp nhận đơn",
      cancelButtonText: "Quay lại",
      confirmButtonColor: "#059669",
      cancelButtonColor: "#64748b",
      reverseButtons: false,
    });

    if (!isConfirmed.isConfirmed) return;

    try {
      await requestInternalApi(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/local-partners/providers/orders/${encodeURIComponent(order.id)}/acknowledge`,
        {
          method: "POST",
        },
      );
      toast.success(
        `Đã tiếp nhận đơn dịch vụ #${order.orderNumber}! Mã phiếu dịch vụ (Voucher) đã tạo thành công.`,
      );
      void externalOrdersQuery.refetch();
    } catch (error) {
      toast.error(getHttpErrorMessage(error, "Không thể tiếp nhận đơn hàng"));
    }
  }

  async function cancelExternalOrder(order: HotelMarketplaceOrder) {
    if (isTerminalOrderStatus(order.status) || order.status !== "PENDING") {
      toast.error("Chỉ có thể hủy đơn hàng đang chờ tiếp nhận.");
      return;
    }

    const items = getCanonicalOrderItems(order);
    const financials = calculateOrderFinancials(order, items);

    const isConfirmed = await SwalVietSage.fire({
      title: `<span style="font-size:17px;font-weight:800;color:#991b1b">Xác nhận hủy đơn #${order.orderNumber}?</span>`,
      html: `
        <div style="text-align:left;font-size:13px;color:#334155;line-height:1.6;display:grid;gap:8px;padding-top:4px;">
          <p style="margin:0"><b>Dịch vụ:</b> ${order.serviceNameSnapshot}${items.length > 1 ? ` (+${items.length - 1} mục khác)` : ""}</p>
          <p style="margin:0"><b>Đối tác:</b> ${order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác dịch vụ"}</p>
          <p style="margin:0"><b>Khách / Phòng:</b> Phòng ${order.stay?.room?.roomNumber ?? "-"} (${order.stay?.guestDisplayName ?? "Khách lưu trú"})</p>
          <p style="margin:0"><b>Giá trị đơn:</b> ${financials.customerTotal.toLocaleString("vi-VN")} ${financials.currency}</p>
          <div style="margin-top:6px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-size:12px;color:#991b1b">
            ⚠️ <b>Lưu ý:</b> Đơn hàng này sẽ bị hủy. Thông báo hủy sẽ gửi Realtime đến Đối tác & Khách hàng.
          </div>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "× Hủy đơn hàng",
      cancelButtonText: "Quay lại",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      reverseButtons: false,
    });

    if (!isConfirmed.isConfirmed) return;

    try {
      await requestInternalApi(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/local-partners/providers/orders/${encodeURIComponent(order.id)}/cancel`,
        {
          method: "POST",
        },
      );
      toast.success(`Đã hủy đơn dịch vụ #${order.orderNumber}`);
      void externalOrdersQuery.refetch();
    } catch (error) {
      toast.error(getHttpErrorMessage(error, "Không thể hủy đơn hàng"));
    }
  }

  function openVoucherModal(order: HotelMarketplaceOrder) {
    if (
      !order.voucher?.voucherNumber &&
      order.hotelCoordinationStatus !== "VOUCHER_ISSUED"
    ) {
      toast.info("Chưa có mã phiếu cho đơn hàng này");
      return;
    }
    const items = getCanonicalOrderItems(order);
    const financials = calculateOrderFinancials(order, items);
    const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
    const serviceName =
      items.length > 1
        ? `${items[0].serviceName} (+${items.length - 1} mục khác)`
        : order.serviceNameSnapshot;

    printMarketplaceVoucherTicket({
      voucherCode: order.voucher?.voucherNumber ?? "VOUCHER",

      guestDisplayName: order.stay?.guestDisplayName ?? "Khách lưu trú",
      roomNumber: order.stay?.room?.roomNumber ?? "-",
      providerDisplayName:
        order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác dịch vụ",
      orderNumber: order.orderNumber,
      serviceName,
      quantity: totalQty,
      totalAmount: financials.customerTotal,
      currency: financials.currency,
      guestNote: order.guestNote,
      items: items.map(({ serviceName, quantity, unitPrice }) => ({
        serviceName,
        quantity,
        unitPrice,
      })),
    });
  }

  function openExternalOrderDetailModal(order: HotelMarketplaceOrder) {
    const statusMeta = getExternalOrderStatusLabel(order.status);
    const isHotelAcknowledged =
      order.hotelCoordinationStatus === "ACKNOWLEDGED" ||
      order.hotelCoordinationStatus === "VOUCHER_ISSUED";
    const items = getCanonicalOrderItems(order);
    const financials = calculateOrderFinancials(order, items);

    const itemsTableHtml = `
      <div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
          <thead style="background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:700">
            <tr>
              <th style="padding:8px 10px">Dịch vụ (Canonical Items)</th>
              <th style="padding:8px 10px;text-align:center">Số lượng</th>
              <th style="padding:8px 10px;text-align:right">Đơn giá (Read-only)</th>
              <th style="padding:8px 10px;text-align:right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 10px">
                  <div style="font-weight:700;color:#0f172a">${it.serviceName}</div>
                  <div style="font-size:11px;color:#64748b">${it.serviceTenantName ?? order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác"}</div>
                </td>
                <td style="padding:8px 10px;text-align:center;font-weight:700;color:#334155">${it.quantity} ${it.pricingUnit ?? ""}</td>
                <td style="padding:8px 10px;text-align:right;color:#475569;font-family:monospace">${Number(it.unitPrice).toLocaleString("vi-VN")} ${financials.currency}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#0f172a;font-family:monospace">${(Number(it.unitPrice) * Number(it.quantity)).toLocaleString("vi-VN")} ${financials.currency}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    void SwalVietSage.fire({
      title: `<span style="font-size:18px;font-weight:800;color:#0f172a">Đơn Dịch Vụ Bên Ngoài #${order.orderNumber}</span>`,
      html: `
        <div style="text-align:left;font-size:13px;color:#334155;line-height:1.6;display:grid;gap:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#fef3c7;color:#92400e;font-weight:800;font-size:12px">🌐 Đơn hàng dịch vụ đối tác liên kết</span>
            <span style="font-size:12px;color:#64748b">${formatOpsDateTime(order.createdAt)}</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f8fafc;padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0;font-size:12px">
            <div>
              <span style="color:#64748b">Khách hàng / Phòng:</span><br/>
              <b>${order.stay?.guestDisplayName ?? "Khách lưu trú"}</b> · <span style="background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:4px;font-weight:700">Phòng ${order.stay?.room?.roomNumber ?? "-"}</span>
            </div>
            <div>
              <span style="color:#64748b">Đối tác thực hiện:</span><br/>
              <b>${order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác dịch vụ"}</b>
            </div>
          </div>

          <div>
            <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:#475569;letter-spacing:0.04em">Danh sách hạng mục dịch vụ (${items.length} món):</span>
            ${itemsTableHtml}
          </div>

          <!-- Pricing breakdown card (Read-only for hotel) -->
          <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:12px 14px;display:grid;gap:4px;font-size:13px">
            <div style="display:flex;justify-content:space-between;align-items:center;color:#334155">
              <span>Tạm tính đối tác (Partner Subtotal):</span>
              <span style="font-weight:700;font-family:monospace;color:#1e293b">${financials.partnerSubtotal.toLocaleString("vi-VN")} ${financials.currency}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;color:#0284c7">
              <span>Phí dịch vụ khách sạn (Hotel Fee 10%):</span>
              <span style="font-weight:700;font-family:monospace">+${financials.hotelFee.toLocaleString("vi-VN")} ${financials.currency}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1.5px solid #86efac;padding-top:6px;margin-top:2px;font-size:14px">
              <span style="font-weight:800;color:#065f46">Tổng tiền khách thanh toán (Customer Total):</span>
              <span style="font-weight:900;font-family:monospace;color:#047857;font-size:16px">${financials.customerTotal.toLocaleString("vi-VN")} ${financials.currency}</span>
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;font-style:italic">
              * Khách sạn ghi nhận toàn bộ hạng mục và không điều chỉnh trực tiếp đơn giá dịch vụ của đối tác.
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div><b>Trạng thái đối tác:</b> <span style="color:#0369a1;font-weight:700">${statusMeta.label}</span></div>
            <div><b>Tiếp nhận khách sạn:</b> <span style="color:${isHotelAcknowledged ? "#047857" : "#b45309"};font-weight:700">${isHotelAcknowledged ? "Đã tiếp nhận" : "Chờ tiếp nhận"}</span></div>
          </div>

          ${order.guestNote ? `<p style="margin:2px 0 0;padding:8px 10px;background:#fffbeb;border-radius:8px;font-style:italic;border:1px solid #fef3c7;font-size:12px;color:#92400e">Ghi chú của khách: &quot;${order.guestNote}&quot;</p>` : ""}
          ${order.voucher?.voucherNumber ? `<p style="margin:2px 0 0;padding:8px 10px;background:#eef2ff;border-radius:8px;font-weight:bold;color:#312e81;border:1px solid #c7d2fe;font-size:12px">🎟️ Mã phiếu dịch vụ (Voucher): <span style="font-family:monospace;letter-spacing:0.05em">${order.voucher.voucherNumber}</span></p>` : ""}
        </div>
      `,
      confirmButtonColor: "#00003c",
      confirmButtonText: "Đóng",
    });
  }

  const externalOrderColumns: DataTableColumn<HotelMarketplaceOrder>[] = [
    {
      key: "orderNumber",
      sortable: true,
      header: "Mã đơn",
      cell: (order) => {
        const shortCode =
          order.orderNumber.length > 12
            ? `${order.orderNumber.slice(0, 4)}...${order.orderNumber.slice(-6)}`
            : order.orderNumber;
        return (
          <div title={order.orderNumber} className="py-1">
            <div className="font-mono font-extrabold text-slate-900 text-sm tracking-tight">
              #{shortCode}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              {formatOpsDateTime(order.createdAt)}
            </div>
          </div>
        );
      },
    },
    {
      key: "partner",
      sortable: true,
      header: "Đối tác",
      cell: (order) => (
        <div
          className="font-bold text-slate-800 text-sm max-w-35 truncate py-1"
          title={order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác"}
        >
          {order.serviceTenant?.serviceProfile?.displayName ??
            "Đối tác dịch vụ"}
        </div>
      ),
    },
    {
      key: "service",
      sortable: true,
      header: "Dịch vụ",
      cell: (order) => {
        const items = getCanonicalOrderItems(order);
        const totalQty = items.reduce(
          (s, it) => s + (Number(it.quantity) || 1),
          0,
        );
        if (items.length > 1) {
          return (
            <div className="space-y-0.5 py-1">
              <div className="text-sm font-bold text-slate-900 leading-snug">
                {items[0].serviceName}
                <span className="ml-1.5 inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-black text-indigo-900 border border-indigo-200">
                  +{items.length - 1} mục khác
                </span>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Tổng cộng {totalQty} dịch vụ
              </div>
            </div>
          );
        }
        return (
          <div className="text-sm font-bold text-slate-900 py-1 leading-snug">
            {order.serviceNameSnapshot}
            {order.quantity > 1 ? (
              <span className="ml-1.5 inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-black text-amber-900">
                ×{order.quantity}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "guestRoom",
      sortable: true,
      header: "Khách / Phòng",
      cell: (order) => (
        <div className="text-sm text-slate-800 font-medium py-1">
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-black text-indigo-950 border border-indigo-200 mr-1.5">
            Phòng {order.stay?.room?.roomNumber ?? "-"}
          </span>
          <span className="font-bold text-slate-900">
            {order.stay?.guestDisplayName ?? "Khách lưu trú"}
          </span>
        </div>
      ),
    },
    {
      key: "totalAmount",
      sortable: true,
      header: "Thanh toán",
      cell: (order) => {
        const financials = calculateOrderFinancials(order);
        return (
          <div className="py-1 space-y-0.5">
            <div className="font-black text-emerald-700 text-sm">
              {financials.customerTotal.toLocaleString("vi-VN")}{" "}
              {financials.currency}
            </div>
            <div className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
              ĐT: {financials.partnerSubtotal.toLocaleString("vi-VN")} · Phí KS:{" "}
              {financials.hotelFee.toLocaleString("vi-VN")}
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      sortable: true,
      header: "Trạng thái",
      cell: (order) => {
        const isHotelAcknowledged =
          order.hotelCoordinationStatus === "ACKNOWLEDGED" ||
          order.hotelCoordinationStatus === "VOUCHER_ISSUED";

        if (order.status === "CANCELLED" || order.status === "REJECTED") {
          return (
            <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200">
              Đã hủy
            </span>
          );
        }

        if (order.status === "COMPLETED") {
          return (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              Hoàn thành
            </span>
          );
        }

        if (!isHotelAcknowledged) {
          return (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
              Chờ tiếp nhận
            </span>
          );
        }

        const partnerMeta = getExternalOrderStatusLabel(order.status);
        return (
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold border ${partnerMeta.className}`}
          >
            {partnerMeta.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      sortable: false,
      header: "Thao tác",
      className: "whitespace-nowrap min-w-[100px]",
      cell: (order) => {
        const isFinished = isTerminalOrderStatus(order.status);
        if (isFinished) {
          return <span className="text-xs font-medium text-slate-400">-</span>;
        }

        const isHotelAcknowledged =
          order.hotelCoordinationStatus === "ACKNOWLEDGED" ||
          order.hotelCoordinationStatus === "VOUCHER_ISSUED";
        const isVoucherIssued = Boolean(
          order.voucher?.voucherNumber ||
          order.hotelCoordinationStatus === "VOUCHER_ISSUED",
        );

        return (
          <div
            className="flex items-center gap-1.5 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {!isHotelAcknowledged ? (
              <>
                <button
                  type="button"
                  disabled={isMutating || isTerminalOrderStatus(order.status)}
                  onClick={() => {
                    void acknowledgeExternalOrder(order);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-50"
                  title="Tiếp nhận đơn hàng và khởi tạo mã dịch vụ (Voucher)"
                >
                  <VsIcon name="check_circle" className="text-xs" />
                  <span>Tiếp nhận</span>
                </button>

                {order.status === "PENDING" ? (
                  <button
                    type="button"
                    disabled={isMutating || isTerminalOrderStatus(order.status)}
                    onClick={() => {
                      void cancelExternalOrder(order);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-400 active:scale-[0.97] transition-all shadow-2xs disabled:opacity-50"
                    title="Hủy đơn hàng"
                  >
                    <VsIcon name="close" className="text-xs" />
                    <span>Hủy</span>
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {isVoucherIssued ? (
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => openVoucherModal(order)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 active:scale-[0.97] transition-all shadow-2xs disabled:opacity-50"
                    title="Xem mã phiếu dịch vụ"
                  >
                    <VsIcon name="confirmation_number" className="text-xs" />
                    <span>Xem phiếu</span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      },
    },
  ];

  const requestTableHeader = (
    <div className="flex items-center justify-between border-b border-[color:rgba(198,197,213,0.18)] px-4 py-3">
      <p className="text-sm font-semibold text-[var(--on-surface-variant)]">
        {total} {mergedLabels.requestCountSuffix}
      </p>
      <Link
        href={serviceCatalogPath}
        className="text-sm font-semibold text-[var(--primary)]"
      >
        {mergedLabels.manageCatalog}
      </Link>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top level Inbox Tabs */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3.5">
        <button
          type="button"
          onClick={() => setInboxTab("HOTEL_REQUESTS")}
          className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            inboxTab === "HOTEL_REQUESTS"
              ? "bg-[#00003c] text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>🛎️ Yêu cầu dịch vụ khách sạn</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-black ${inboxTab === "HOTEL_REQUESTS" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-800"}`}
          >
            {displayedRequests.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setInboxTab("EXTERNAL_ORDERS")}
          className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            inboxTab === "EXTERNAL_ORDERS"
              ? "bg-amber-800 text-white shadow-xs"
              : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
          }`}
        >
          <span>🌐 Dịch vụ ngoài khách sạn</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-black ${inboxTab === "EXTERNAL_ORDERS" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"}`}
          >
            {externalOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setInboxTab("ALL")}
          className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            inboxTab === "ALL"
              ? "bg-slate-800 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>📋 Tất cả</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-black ${inboxTab === "ALL" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-800"}`}
          >
            {displayedRequests.length + externalOrders.length}
          </span>
        </button>
      </div>

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-4 md:grid-cols-2 xl:grid-cols-6"
      >
        <label className="relative md:col-span-2 xl:col-span-2">
          <VsIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--on-surface-variant)]"
          />
          <input
            value={filters.q ?? ""}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Tìm phòng, khách, số điện thoại, booking hoặc dịch vụ..."
            className="min-h-10 w-full rounded-lg border px-10 text-sm"
          />
        </label>
        <select
          value={filters.status ?? ""}
          onChange={(event) => updateFilter("status", event.target.value)}
          className="min-h-10 rounded-lg border px-3 text-sm"
        >
          <option value="">{mergedLabels.allStatuses}</option>
          {hotelRequestStatuses.map((status) => (
            <option key={status} value={status}>
              {requestStatusLabelMap[status]}
            </option>
          ))}
        </select>
        <input
          value={filters.roomNumber ?? ""}
          onChange={(event) => updateFilter("roomNumber", event.target.value)}
          placeholder={mergedLabels.roomNumberPlaceholder}
          className="min-h-10 rounded-lg border px-3 text-sm"
        />
        <select
          value={filters.priority ?? ""}
          onChange={(event) => updateFilter("priority", event.target.value)}
          className="min-h-10 rounded-lg border px-3 text-sm"
        >
          <option value="">Tất cả mức độ ưu tiên</option>
          <option value="NORMAL">{requestPriorityLabelMap.NORMAL}</option>
          <option value="URGENT">{requestPriorityLabelMap.URGENT}</option>
        </select>
        <input
          value={filters.assignedToUserId ?? ""}
          onChange={(event) =>
            updateFilter("assignedToUserId", event.target.value)
          }
          placeholder={mergedLabels.assignedUserIdPlaceholder}
          className="min-h-10 rounded-lg border px-3 text-sm"
        />
        <input
          value={filters.from ?? ""}
          onChange={(event) => updateFilter("from", event.target.value)}
          placeholder="DD/MM/YYYY"
          inputMode="numeric"
          pattern="\d{2}/\d{2}/\d{4}"
          className="min-h-10 rounded-lg border px-3 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={filters.to ?? ""}
            onChange={(event) => updateFilter("to", event.target.value)}
            placeholder="DD/MM/YYYY"
            inputMode="numeric"
            pattern="\d{2}/\d{2}/\d{4}"
            className="min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--on-primary)]"
          >
            Đặt lại
          </button>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {hotelRequestStatuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => applyStatusFilter(status)}
            className={`rounded-xl border p-3 text-left transition ${filters.status === status ? "border-[var(--primary)] bg-[var(--primary-fixed)]" : "border-[color:rgba(198,197,213,0.24)] bg-white hover:border-[var(--outline-variant)]"}`}
          >
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(status)}`}
            >
              {requestStatusLabelMap[status]}
            </span>
            <span className="mt-3 block text-2xl font-semibold text-[var(--primary)]">
              {activeSummaryCounts[status] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {inboxTab === "EXTERNAL_ORDERS" ? (
        <DataTable<HotelMarketplaceOrder>
          columns={externalOrderColumns}
          data={externalOrders}
          getRowKey={(order) => order.id}
          emptyMessage="Hiện chưa có đơn hàng dịch vụ ngoài khách sạn nào."
          minWidth="1000px"
          header={requestTableHeader}
          onRowClick={(order) => openExternalOrderDetailModal(order)}
          pagination={{
            page: externalPage,
            pageSize: externalPageSize,
            totalItems: externalOrders.length,
            pageSizeOptions: [10, 20, 50],
            onPageChange: (newPage) => setExternalPage(newPage),
            onPageSizeChange: (newPageSize) => {
              setExternalPageSize(newPageSize);
              setExternalPage(1);
            },
          }}
        />
      ) : (
        <DataTable
          columns={requestColumns}
          data={activeTabRequests}
          getRowKey={(request) => request.id}
          emptyMessage={mergedLabels.emptyState}
          minWidth="1000px"
          header={requestTableHeader}
          onRowClick={(request) => openRequestRow(request)}
          sort={{
            key: sortState.key,
            direction: sortState.direction,
            onSortChange: (key, direction) =>
              setSortState({ key: key as RequestSortKey, direction }),
          }}
          pagination={
            inboxTab === "HOTEL_REQUESTS" && page && pageSize
              ? {
                  page,
                  pageSize,
                  pageSizeOptions,
                  totalItems: total,
                  serverSide: true,
                  getPageHref: (nextPage) => getPaginationHref(nextPage),
                  getPageSizeHref: (nextPageSize) =>
                    getPaginationHref(1, nextPageSize),
                }
              : {
                  page: hotelPage,
                  pageSize: hotelPageSize,
                  totalItems: activeTabRequests.length,
                  pageSizeOptions: [10, 20, 50],
                  onPageChange: (p) => setHotelPage(p),
                  onPageSizeChange: (ps) => {
                    setHotelPageSize(ps);
                    setHotelPage(1);
                  },
                }
          }
        />
      )}
    </div>
  );
}
