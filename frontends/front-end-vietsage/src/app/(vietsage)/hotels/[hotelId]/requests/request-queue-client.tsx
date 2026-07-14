"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Swal from "sweetalert2";

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
  getGuestLabel,
  getRequestTitle,
  getRoomLabel,
  priorityTone,
  requestPriorityLabelMap,
  requestStatusLabelMap,
  requestTypeLabelMap,
  statusTone,
} from "@/features/hotel-ops/utils/hotel-ops-display";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";

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

type UrgentRequestNotification = StaffRequestListItem & {
  receivedAt: string;
  acknowledgedAt?: string;
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
  allStatuses: "All statuses",
  roomNumberPlaceholder: "Room number",
  allServiceItems: "All service items",
  assignedUserIdPlaceholder: "Assigned user ID",
  filterButton: "Filter",
  requestCountSuffix: "requests",
  manageCatalog: "Manage catalog",
  room: "Room",
  guest: "Guest",
  service: "Service",
  category: "Category",
  quantity: "Qty",
  priority: "Priority",
  status: "Status",
  assigned: "Assigned",
  created: "Created",
  unassigned: "Unassigned",
  emptyState: "No requests match the current filters.",
  closeDetail: "Close",
  requestDetail: "Request detail",
  reservationCode: "Reservation",
  details: "Details",
  actionNote: "Guest-visible note",
  assignmentNote: "Assignment note",
  timelineNote: "Timeline note",
  staffUserId: "Staff user ID",
  statusActions: "Status actions",
  assignment: "Assignment",
  timeline: "Timeline",
  saveAssignment: "Assign",
  unassign: "Unassign",
  noTimeline: "No timeline events yet.",
  guestVisibleNoteHelp: "Status notes are visible to the guest.",
  openRequest: "Open request",
  loadingDetail: "Loading request detail...",
  operationError: "Could not update this request.",
};

const actionMeta: Record<
  StaffRequestAction,
  { label: string; status: GuestRequestStatus; note: string; className: string }
> = {
  ACCEPT: {
    label: "Tiếp nhận",
    status: "ACKNOWLEDGED",
    note: "Chúng tôi đã tiếp nhận yêu cầu.",
    className: "bg-[var(--primary)] text-[var(--on-primary)]",
  },
  START: {
    label: "Bắt đầu",
    status: "IN_PROGRESS",
    note: "Nhân sự phụ trách đang trên đường hỗ trợ.",
    className:
      "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  },
  COMPLETE: {
    label: "Hoàn thành",
    status: "COMPLETED",
    note: "Yêu cầu của quý khách đã được hoàn thành.",
    className: "bg-emerald-700 text-white",
  },
  CANCEL: {
    label: "Hủy",
    status: "CANCELLED",
    note: "Rất tiếc, dịch vụ này hiện chưa khả dụng.",
    className: "bg-[var(--error-container)] text-[var(--on-error-container)]",
  },
  FAIL: {
    label: "Đánh dấu thất bại",
    status: "FAILED",
    note: "Chúng tôi chưa thể hoàn tất yêu cầu này.",
    className: "bg-zinc-800 text-white",
  },
};

const statusActions: Record<GuestRequestStatus, StaffRequestAction[]> = {
  CREATED: ["ACCEPT", "CANCEL"],
  ACKNOWLEDGED: ["START", "CANCEL"],
  IN_PROGRESS: ["COMPLETE", "FAIL"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

const swalButtonColor = "#00003c";

function isFinalRequestStatus(status: GuestRequestStatus): boolean {
  return (
    status === "COMPLETED" || status === "CANCELLED" || status === "FAILED"
  );
}

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

function escapeHtml(value: unknown): string {
  return String(value ?? "-").replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

function formatRequestMoney(value: unknown, currency = "VND"): string {
  if (value === null || value === undefined || value === "") return "-";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

function getServiceDetailPrice(serviceItem: HotelGuestRequest["serviceItem"]): { value: unknown; currency: string } {
  const category = serviceItem?.category;
  const currency = serviceItem?.effectiveCurrency ?? category?.currency ?? serviceItem?.currency ?? "VND";
  const value = serviceItem?.priceOverride ?? serviceItem?.effectivePrice ?? category?.defaultPrice ?? serviceItem?.price ?? null;
  return { value, currency };
}

function renderTranslationRows(translations: Array<{ locale: string; name: string; description: string | null }> | undefined): string {
  if (!translations?.length) return `<p style="margin:8px 0 0;color:#64748b">No multilingual content.</p>`;

  return `
    <div style="margin-top:8px;display:grid;gap:8px">
      ${translations
        .map((translation) => `
          <div style="border-top:1px solid #e5e7eb;padding-top:8px">
            <p style="margin:0"><b>${escapeHtml(translation.locale)}:</b> ${escapeHtml(translation.name)}</p>
            <p style="margin:4px 0 0;color:#64748b">${escapeHtml(translation.description ?? "-")}</p>
          </div>`)
        .join("")}
    </div>`;
}

function showServiceCatalogDetails(request: HotelGuestRequest | null, row: StaffRequestListItem, labels: RequestQueueLabels) {
  const serviceItem = request?.serviceItem ?? null;
  const category = serviceItem?.category ?? null;
  const price = getServiceDetailPrice(serviceItem);
  const serviceName = serviceItem?.name ?? row.displayName;
  const categoryName = category?.name ?? row.categoryName ?? "-";

  void Swal.fire({
    title: labels.details,
    html: `
      <div style="text-align:left;display:grid;gap:12px">
        <section style="border:1px solid #e5e7eb;border-radius:12px;padding:12px">
          <p style="margin:0 0 6px;font-weight:700;color:#00003c">Service item</p>
          <p style="margin:0"><b>Name:</b> ${escapeHtml(serviceName)}</p>
          <p style="margin:4px 0 0"><b>Description:</b> ${escapeHtml(serviceItem?.description ?? row.description ?? "-")}</p>
          <p style="margin:4px 0 0"><b>Price:</b> ${escapeHtml(formatRequestMoney(price.value, price.currency))}</p>
          <p style="margin:4px 0 0"><b>Quantity rule:</b> ${escapeHtml(serviceItem?.quantityEnabled ? `${serviceItem.minQuantity}-${serviceItem.maxQuantity ?? "+"}` : "Not required")}</p>
          <p style="margin:4px 0 0"><b>Status:</b> ${escapeHtml(serviceItem?.status ?? "-")}</p>
          <p style="margin:10px 0 0;font-weight:700;color:#00003c">Multilingual options</p>
          ${renderTranslationRows(serviceItem?.translations)}
        </section>
        <section style="border:1px solid #e5e7eb;border-radius:12px;padding:12px">
          <p style="margin:0 0 6px;font-weight:700;color:#00003c">Category service</p>
          <p style="margin:0"><b>Name:</b> ${escapeHtml(categoryName)}</p>
          <p style="margin:4px 0 0"><b>Description:</b> ${escapeHtml(category?.description ?? "-")}</p>
          <p style="margin:4px 0 0"><b>Default price:</b> ${escapeHtml(formatRequestMoney(category?.defaultPrice, category?.currency))}</p>
          <p style="margin:4px 0 0"><b>Status:</b> ${escapeHtml(category?.status ?? "-")}</p>
          <p style="margin:10px 0 0;font-weight:700;color:#00003c">Multilingual options</p>
          ${renderTranslationRows(category?.translations)}
        </section>
      </div>`,
    confirmButtonColor: swalButtonColor,
    confirmButtonText: labels.closeDetail,
  });
}

function hasDisplayableTimelineEvent(
  event: NonNullable<HotelGuestRequest["events"]>[number],
): boolean {
  return Boolean(event.status || event.type || event.note?.trim());
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

async function openRequestDetailModal({
  request,
  ownerApiBasePath,
  queryClient,
  operationErrorFallback,
  setSelectedRow,
  setSelectedRequest,
  setAssignmentUserId,
  setAssignmentNote,
  setStatusNote,
  setOperationError,
}: {
  request: StaffRequestListItem;
  ownerApiBasePath?: string;
  queryClient: QueryClient;
  operationErrorFallback: string;
  setSelectedRow: Dispatch<SetStateAction<StaffRequestListItem | null>>;
  setSelectedRequest: Dispatch<SetStateAction<HotelGuestRequest | null>>;
  setAssignmentUserId: Dispatch<SetStateAction<string>>;
  setAssignmentNote: Dispatch<SetStateAction<string>>;
  setStatusNote: Dispatch<SetStateAction<string>>;
  setOperationError: Dispatch<SetStateAction<string | null>>;
}) {
  setSelectedRow(request);
  setSelectedRequest(null);
  setAssignmentUserId("");
  setAssignmentNote("");
  setStatusNote("");
  setOperationError(null);

  if (!ownerApiBasePath) return;

  try {
    const fresh = await queryClient.fetchQuery({
      queryKey: ["hotel-request-detail", ownerApiBasePath, request.id] as const,
      queryFn: () =>
        requestInternalApi<HotelGuestRequest>(
          `${ownerApiBasePath}/${encodeURIComponent(request.id)}`,
          { method: "GET" },
        ),
    });
    setSelectedRequest(fresh);
    setAssignmentUserId(fresh.assignedToUserId ?? "");
  } catch (error) {
    setOperationError(getHttpErrorMessage(error, operationErrorFallback));
  }
}

function openRequestWithContext({
  request,
  detailMode,
  basePath,
  router,
  ownerApiBasePath,
  queryClient,
  operationErrorFallback,
  setSelectedRow,
  setSelectedRequest,
  setAssignmentUserId,
  setAssignmentNote,
  setStatusNote,
  setOperationError,
}: {
  request: StaffRequestListItem;
  detailMode: "page" | "modal";
  basePath: string;
  router: ReturnType<typeof useRouter>;
  ownerApiBasePath?: string;
  queryClient: QueryClient;
  operationErrorFallback: string;
  setSelectedRow: Dispatch<SetStateAction<StaffRequestListItem | null>>;
  setSelectedRequest: Dispatch<SetStateAction<HotelGuestRequest | null>>;
  setAssignmentUserId: Dispatch<SetStateAction<string>>;
  setAssignmentNote: Dispatch<SetStateAction<string>>;
  setStatusNote: Dispatch<SetStateAction<string>>;
  setOperationError: Dispatch<SetStateAction<string | null>>;
}) {
  if (detailMode === "modal") {
    void openRequestDetailModal({
      request,
      ownerApiBasePath,
      queryClient,
      operationErrorFallback,
      setSelectedRow,
      setSelectedRequest,
      setAssignmentUserId,
      setAssignmentNote,
      setStatusNote,
      setOperationError,
    });
    return;
  }

  router.push(`${basePath}/${request.id}`);
}

function sortUrgentNotifications(
  notifications: UrgentRequestNotification[],
) {
  return notifications.sort((left, right) => {
    if (Boolean(left.acknowledgedAt) !== Boolean(right.acknowledgedAt)) {
      return left.acknowledgedAt ? 1 : -1;
    }
    return (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
  });
}

function toUrgentNotification(
  request: StaffRequestListItem,
  existing?: UrgentRequestNotification,
): UrgentRequestNotification {
  return {
    ...(existing ?? request),
    ...request,
    receivedAt: existing?.receivedAt ?? new Date().toISOString(),
    acknowledgedAt: existing?.acknowledgedAt,
  };
}

function isCheckedOutRequest(
  request: Partial<Pick<StaffRequestListItem, "checkedOutAt" | "stayStatus">>,
): boolean {
  return Boolean(request.checkedOutAt) || request.stayStatus === "CHECKED_OUT";
}

function shouldShowInUrgentPanel(
  request: Partial<Pick<StaffRequestListItem, "priority" | "status" | "checkedOutAt" | "stayStatus">>,
): boolean {
  const status = request.status;
  if (!status) return false;
  return request.priority === "URGENT" && !isFinalRequestStatus(status) && !isCheckedOutRequest(request);
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

function mergeUrgentRequests(
  currentNotifications: UrgentRequestNotification[],
  requests: StaffRequestListItem[],
) {
  const byId = new Map(
    currentNotifications
      .filter((notification) => shouldShowInUrgentPanel(notification))
      .map((notification) => [notification.id, notification]),
  );

  requests.forEach((request) => {
    if (shouldShowInUrgentPanel(request)) {
      byId.set(request.id, toUrgentNotification(request, byId.get(request.id)));
      return;
    }

    byId.delete(request.id);
  });

  return sortUrgentNotifications([...byId.values()]);
}

export function RequestQueueClient({
  hotelId,
  requests,
  total,
  summary,
  initialFilters,
  basePath = `/hotels/${hotelId}/requests`,
  serviceCatalogPath = `/hotels/${hotelId}/services`,
  ownerApiBasePath,
  labels,
  detailMode = "page",
  initialDetailRequestId,
  page,
  pageSize,
  pageSizeOptions = [10, 20, 50],
}: RequestQueueClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const mergedLabels = { ...defaultLabels, ...labels };
  const operationErrorFallback = mergedLabels.operationError;
  const canManageRequests = Boolean(ownerApiBasePath);
  const requestedDetailId =
    initialDetailRequestId ?? searchParams.get("requestId") ?? "";
  const [filters, setFilters] = useState(() => toFilterState(initialFilters));
  const [sortState, setSortState] = useState<{
    key: RequestSortKey;
    direction: DataTableSortDirection;
  }>({ key: "created", direction: "desc" });
  const [liveRequestChanges, setLiveRequestChanges] = useState<
    Record<string, Partial<StaffRequestListItem> & { id: string }>
  >({});
  const [urgentNotifications, setUrgentNotifications] = useState<
    UrgentRequestNotification[]
  >(() => mergeUrgentRequests([], requests));
  const [isUrgentPanelOpen, setIsUrgentPanelOpen] = useState(
    searchParams.get("urgentPanel") === "1",
  );
  const [selectedRow, setSelectedRow] = useState<StaffRequestListItem | null>(
    null,
  );
  const [selectedRequest, setSelectedRequest] =
    useState<HotelGuestRequest | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const openedDetailRequestIdRef = useRef("");
  const [statusNote, setStatusNote] = useState("");
  const [assignmentUserId, setAssignmentUserId] = useState("");
  const [assignmentNote, setAssignmentNote] = useState("");
  const selectedRequestId = selectedRow?.id;
  const detailQueryKey = useMemo(
    () =>
      ["hotel-request-detail", ownerApiBasePath, selectedRequestId] as const,
    [ownerApiBasePath, selectedRequestId],
  );
  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => {
      if (!ownerApiBasePath || !selectedRequestId) {
        throw new Error(mergedLabels.operationError);
      }

      return requestInternalApi<HotelGuestRequest>(
        `${ownerApiBasePath}/${encodeURIComponent(selectedRequestId)}`,
        { method: "GET" },
      );
    },
    enabled:
      detailMode === "modal" && Boolean(ownerApiBasePath && selectedRequestId),
    refetchInterval: detailMode === "modal" && selectedRequestId ? 5000 : false,
    refetchOnWindowFocus: true,
  });
  const detailRequest = detailQuery.data ?? selectedRequest;
  const isDetailLoading = detailQuery.isFetching && !detailRequest;
  const detailError =
    operationError ??
    (detailQuery.error
      ? getHttpErrorMessage(detailQuery.error, mergedLabels.operationError)
      : null);

  useEffect(() => {
    if (
      detailMode !== "modal" ||
      !ownerApiBasePath ||
      !requestedDetailId ||
      openedDetailRequestIdRef.current === requestedDetailId
    ) {
      return;
    }

    const existingRow = requests.find(
      (request) => request.id === requestedDetailId,
    );

    if (existingRow) {
      void openRequestDetailModal({
        request: existingRow,
        ownerApiBasePath,
        queryClient,
        operationErrorFallback,
        setSelectedRow,
        setSelectedRequest,
        setAssignmentUserId,
        setAssignmentNote,
        setStatusNote,
        setOperationError,
      });
      openedDetailRequestIdRef.current = requestedDetailId;
      return;
    }

    let isActive = true;
    openedDetailRequestIdRef.current = requestedDetailId;

    void queryClient
      .fetchQuery({
        queryKey: [
          "hotel-request-detail",
          ownerApiBasePath,
          requestedDetailId,
        ] as const,
        queryFn: () =>
          requestInternalApi<HotelGuestRequest>(
            `${ownerApiBasePath}/${encodeURIComponent(requestedDetailId)}`,
            { method: "GET" },
          ),
      })
      .then((fresh) => {
        if (!isActive) return;
        setSelectedRow(requestToListItem(fresh));
        setSelectedRequest(fresh);
        setAssignmentUserId(fresh.assignedToUserId ?? "");
        setAssignmentNote("");
        setStatusNote("");
      })
      .catch((error) => {
        if (!isActive) return;
        setOperationError(getHttpErrorMessage(error, operationErrorFallback));
      });

    return () => {
      isActive = false;
    };
  }, [
    detailMode,
    operationErrorFallback,
    ownerApiBasePath,
    queryClient,
    requestedDetailId,
    requests,
  ]);

  useEffect(() => {
    const shouldOpenUrgentPanel = searchParams.get("urgentPanel") === "1";
    if (shouldOpenUrgentPanel) {
      queueMicrotask(() => setIsUrgentPanelOpen(true));
    }
  }, [searchParams]);

  useEffect(() => {
    queueMicrotask(() => {
      setUrgentNotifications((currentNotifications) =>
        mergeUrgentRequests(currentNotifications, requests),
      );
    });
  }, [requests]);

  const applyLiveRequestChange = useCallback((request: Partial<StaffRequestListItem> & { id: string }) => {
    setLiveRequestChanges((currentChanges) => ({
      ...currentChanges,
      [request.id]: {
        ...currentChanges[request.id],
        ...request,
      },
    }));

    setUrgentNotifications((currentNotifications) => {
      const existing = currentNotifications.find((notification) => notification.id === request.id);
      const merged = existing ? { ...existing, ...request } : request;

      if (!shouldShowInUrgentPanel(merged)) {
        return currentNotifications.filter((notification) => notification.id !== request.id);
      }

      return mergeUrgentRequests(currentNotifications, [merged as StaffRequestListItem]);
    });
  }, []);

  const ownerRealtimeHandlers = useMemo(
    () => ({
      onCreated: (request: StaffRequestListItem) => {
        applyLiveRequestChange(request);
        if (shouldShowInUrgentPanel(request)) {
          setIsUrgentPanelOpen(true);
        }
      },
      onUpdated: applyLiveRequestChange,
      onAnswered: applyLiveRequestChange,
      onReconnect: () => router.refresh(),
    }),
    [applyLiveRequestChange, router],
  );

  useOwnerRequestRealtime(hotelId, ownerRealtimeHandlers, {
    showConnectionToasts: false,
  });

  const displayedRequests = useMemo(() => {
    const byId = new Map<string, StaffRequestListItem>(
      requests.map((request) => [request.id, request]),
    );

    for (const request of Object.values(liveRequestChanges)) {
      const existing = byId.get(request.id);
      byId.set(
        request.id,
        existing
          ? { ...existing, ...request }
          : (request as StaffRequestListItem),
      );
    }

    const liveIds = new Set(Object.keys(liveRequestChanges));
    const liveRequests = [...byId.values()].filter((request) =>
      liveIds.has(request.id),
    );
    const stableRequests = [...byId.values()].filter(
      (request) => !liveIds.has(request.id),
    );

    return [...liveRequests, ...stableRequests].sort(
      (leftRequest, rightRequest) => {
        const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
        const result = compareValues(
          getSortableRequestValue(leftRequest, sortState.key),
          getSortableRequestValue(rightRequest, sortState.key),
        );

        return result * directionMultiplier;
      },
    );
  }, [liveRequestChanges, requests, sortState]);


  function openRequestRow(request: StaffRequestListItem) {
    openRequestWithContext({
      request,
      detailMode,
      basePath,
      router,
      ownerApiBasePath,
      queryClient,
      operationErrorFallback,
      setSelectedRow,
      setSelectedRequest,
      setAssignmentUserId,
      setAssignmentNote,
      setStatusNote,
      setOperationError,
    });
  }

  const acknowledgeUrgentRequest = useCallback(
    (requestId: string) => {
      setUrgentNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === requestId && !notification.acknowledgedAt
            ? { ...notification, acknowledgedAt: new Date().toISOString() }
            : notification,
        ),
      );
    },
    [setUrgentNotifications],
  );

  const removeUrgentRequest = useCallback(
    (requestId: string) => {
      setUrgentNotifications((currentNotifications) =>
        currentNotifications.filter(
          (notification) => notification.id !== requestId,
        ),
      );
    },
    [setUrgentNotifications],
  );
  function syncUpdatedRequest(updated: HotelGuestRequest) {
    setSelectedRequest(updated);
    setAssignmentUserId(updated.assignedToUserId ?? "");
    setAssignmentNote("");
    setStatusNote("");
    applyLiveRequestChange(updated as Partial<StaffRequestListItem> & { id: string });
    queryClient.setQueryData(detailQueryKey, updated);
    void queryClient.invalidateQueries({ queryKey: detailQueryKey });
    router.refresh();
  }

  const statusMutation = useMutation({
    mutationFn: ({
      action,
      note,
      assignedToUserId,
    }: {
      action: StaffRequestAction;
      note: string;
      assignedToUserId?: string;
    }) => {
      if (!selectedRow || !ownerApiBasePath) {
        throw new Error(mergedLabels.operationError);
      }

      const meta = actionMeta[action];
      return requestInternalApi<HotelGuestRequest>(
        `${ownerApiBasePath}/${encodeURIComponent(selectedRow.id)}/status`,
        {
          method: "PATCH",
          body: {
            status: meta.status,
            note,
            assignedToUserId,
          },
        },
      );
    },
    onSuccess: (updated) => {
      setStatusNote("");
      syncUpdatedRequest(updated);
      void Swal.fire({
        icon: "success",
        title: "Đã cập nhật trạng thái",
        timer: 1300,
        showConfirmButton: false,
      });
    },
    onError: (error) => {
      const message = getHttpErrorMessage(error, mergedLabels.operationError);
      setOperationError(message);
      void Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái",
        text: message,
        confirmButtonColor: swalButtonColor,
      });
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: ({
      assignedToUserId,
      note,
    }: {
      assignedToUserId: string | null;
      note?: string;
    }) => {
      if (!selectedRow || !ownerApiBasePath) {
        throw new Error(mergedLabels.operationError);
      }

      return requestInternalApi<HotelGuestRequest>(
        `${ownerApiBasePath}/${encodeURIComponent(selectedRow.id)}/assignment`,
        {
          method: "PATCH",
          body: {
            assignedToUserId,
            note,
          },
        },
      );
    },
    onSuccess: (updated) => {
      setAssignmentNote("");
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
      setOperationError(message);
      void Swal.fire({
        icon: "error",
        title: "Không thể cập nhật phân công",
        text: message,
        confirmButtonColor: swalButtonColor,
      });
    },
  });
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

  async function updateStatus(action: StaffRequestAction) {
    if (!selectedRow || !ownerApiBasePath) return;

    const meta = actionMeta[action];
    const note = statusNote.trim() || meta.note;
    const confirmation = await Swal.fire({
      icon:
        meta.status === "CANCELLED" || meta.status === "FAILED"
          ? "warning"
          : "question",
      title: `${meta.label} yêu cầu?`,
      text: "Ghi chú cập nhật trạng thái sẽ hiển thị cho khách.",
      showCancelButton: true,
      confirmButtonText: "Xác nhận",
      cancelButtonText: "Đóng",
      confirmButtonColor: swalButtonColor,
    });

    if (!confirmation.isConfirmed) return;

    setOperationError(null);
    statusMutation.mutate({
      action,
      note,
      assignedToUserId:
        meta.status === "IN_PROGRESS"
          ? assignmentUserId.trim() || undefined
          : undefined,
    });
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow || !ownerApiBasePath) return;

    const nextAssignedToUserId = assignmentUserId.trim() || null;
    const confirmation = await Swal.fire({
      icon: nextAssignedToUserId ? "question" : "warning",
      title: nextAssignedToUserId ? "Cập nhật phân công?" : "Gỡ phân công?",
      text: nextAssignedToUserId
        ? "Yêu cầu sẽ được giao cho nhân sự đã nhập."
        : "Yêu cầu sẽ chuyển về trạng thái chưa phân công.",
      showCancelButton: true,
      confirmButtonText: "Xác nhận",
      cancelButtonText: "Đóng",
      confirmButtonColor: swalButtonColor,
    });

    if (!confirmation.isConfirmed) return;

    setOperationError(null);
    assignmentMutation.mutate({
      assignedToUserId: nextAssignedToUserId,
      note: assignmentNote.trim() || undefined,
    });
  }

  async function unassignRequest() {
    if (!selectedRow || !ownerApiBasePath) return;

    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Gỡ phân công?",
      text: "Yêu cầu sẽ chuyển về trạng thái chưa phân công.",
      showCancelButton: true,
      confirmButtonText: "Gỡ phân công",
      cancelButtonText: "Đóng",
      confirmButtonColor: swalButtonColor,
    });

    if (!confirmation.isConfirmed) return;

    setOperationError(null);
    assignmentMutation.mutate({
      assignedToUserId: null,
      note: assignmentNote.trim() || "Đã gỡ phân công nhân sự.",
    });
  }

  function renderRequestDetail(
    row: StaffRequestListItem,
    request: HotelGuestRequest | null,
  ) {
    const events = (request?.events ?? []).filter(hasDisplayableTimelineEvent);
    const displayName = request ? getRequestTitle(request) : row.displayName;
    const currentStatus = request?.status ?? row.status;
    const availableActions = statusActions[currentStatus];
    const isCheckedOut = isCheckedOutRequest(row);
    const shouldShowActionPanel =
      canManageRequests && !isFinalRequestStatus(currentStatus) && !isCheckedOut;

    return (
      <div
        className={`grid gap-5 ${shouldShowActionPanel ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-[var(--surface-container-low)] p-4">
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone(currentStatus)}`}
              >
                {requestStatusLabelMap[currentStatus]}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${priorityTone(request?.priority ?? row.priority)}`}
              >
                {requestPriorityLabelMap[request?.priority ?? row.priority]}
              </span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-[var(--primary)]">
              {displayName}
            </h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              {request?.type ? `${requestTypeLabelMap[request.type]} - ` : ""}
              {formatOpsDateTime(request?.createdAt ?? row.createdAt)}
            </p>
          </div>
          {isCheckedOut ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              Khách đã checkout nên yêu cầu này không thể tiếp tục phục vụ. Vui lòng giữ lại để đối soát hoặc đóng yêu cầu theo quy trình nội bộ.
            </div>
          ) : null}
          <div
            className={`grid gap-3 md:grid-cols-2 ${shouldShowActionPanel ? "" : "xl:grid-cols-3"}`}
          >
            <div className="rounded-lg bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.reservationCode}
              </p>
              <p className="mt-1 font-semibold text-[var(--primary)]">
                {request?.stay?.reservationCode ?? request?.stayId ?? "-"}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.room}
              </p>
              <p className="mt-1 font-semibold text-[var(--primary)]">
                {request ? getRoomLabel(request) : `Phòng ${row.roomNumber}`}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.assigned}
              </p>
              <p className="mt-1 font-semibold text-[var(--primary)]">
                {request?.assignedToUser?.name ??
                  request?.assignedToUserId ??
                  row.assignedToName ??
                  mergedLabels.unassigned}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.guest}
              </p>
              <p className="mt-1 font-semibold text-[var(--primary)]">
                {request ? getGuestLabel(request) : (row.guestName ?? "Khách")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => showServiceCatalogDetails(request, row, mergedLabels)}
              className="rounded-lg bg-[var(--surface-container-low)] p-4 text-left transition hover:bg-[var(--surface-container)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.service}
              </p>
              <p className="mt-1 font-semibold text-[var(--primary)]">
                {request?.serviceItem?.name ?? row.displayName}
              </p>
              <p className="mt-2 text-xs font-semibold text-[var(--secondary)]">
                {mergedLabels.details}
              </p>
            </button>
            <div className="rounded-lg bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.quantity}
              </p>
              <p className="mt-1 font-semibold text-[var(--primary)]">
                {row.quantity}
              </p>
            </div>
          </div>
          {(request?.details ?? row.description) ? (
            <div className="rounded-lg border border-[color:rgba(198,197,213,0.24)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                {mergedLabels.details}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--on-surface-variant)]">
                {request?.details ?? row.description}
              </p>
            </div>
          ) : null}
          <section className="rounded-xl border border-[color:rgba(198,197,213,0.24)] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              {mergedLabels.timeline}
            </h3>
            <div className="mt-3 space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="grid gap-2 rounded-lg bg-[var(--surface-container-low)] p-3 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <p className="text-sm font-semibold text-[var(--primary)]">
                    {event.status
                      ? requestStatusLabelMap[event.status]
                      : (event.type ?? mergedLabels.timelineNote)}
                  </p>
                  <span className="text-xs text-[var(--on-surface-variant)]">
                    {formatOpsDateTime(event.createdAt)}
                  </span>
                  {event.note ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--on-surface-variant)]">
                      {event.note}
                    </p>
                  ) : null}
                </div>
              ))}
              {events.length === 0 ? (
                <p className="text-sm text-[var(--on-surface-variant)]">
                  {mergedLabels.noTimeline}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {shouldShowActionPanel ? (
          <aside className="space-y-4">
            {detailError ? (
              <div className="rounded-lg border border-[var(--error)] bg-[var(--error-container)] p-3 text-sm font-semibold text-[var(--on-error-container)]">
                {detailError}
              </div>
            ) : null}
            {isDetailLoading ? (
              <div className="rounded-lg bg-[var(--surface-container-low)] p-3 text-sm text-[var(--on-surface-variant)]">
                {mergedLabels.loadingDetail}
              </div>
            ) : null}
            <section className="rounded-xl border border-[color:rgba(198,197,213,0.24)] p-4">
              <h3 className="font-semibold text-[var(--primary)]">
                {mergedLabels.statusActions}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--on-surface-variant)]">
                {mergedLabels.guestVisibleNoteHelp}
              </p>
              <textarea
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                placeholder={mergedLabels.actionNote}
                className="mt-3 min-h-24 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <div className="mt-3 grid gap-2">
                {availableActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={isMutating}
                    onClick={() => void updateStatus(action)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${actionMeta[action].className}`}
                  >
                    {actionMeta[action].label}
                  </button>
                ))}
              </div>
            </section>
            <form
              onSubmit={saveAssignment}
              className="rounded-xl border border-[color:rgba(198,197,213,0.24)] p-4"
            >
              <h3 className="font-semibold text-[var(--primary)]">
                {mergedLabels.assignment}
              </h3>
              <input
                value={assignmentUserId}
                onChange={(event) => setAssignmentUserId(event.target.value)}
                placeholder={mergedLabels.staffUserId}
                className="mt-3 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <textarea
                value={assignmentNote}
                onChange={(event) => setAssignmentNote(event.target.value)}
                placeholder={mergedLabels.assignmentNote}
                className="mt-2 min-h-20 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={isMutating}
                  className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-60"
                >
                  {mergedLabels.saveAssignment}
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => void unassignRequest()}
                  className="rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-60"
                >
                  {mergedLabels.unassign}
                </button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
    );
  }

  const requestColumns: DataTableColumn<StaffRequestListItem>[] = [
    {
      key: "room",
      sortable: true,
      header: mergedLabels.room,
      className: "font-semibold text-[var(--primary)]",
      cell: (request) => (
        <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
            Phòng:
          </span>
          <span>{request.roomNumber}</span>
        </span>
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
      key: "category",
      sortable: true,
      header: mergedLabels.category,
      cell: (request) => request.categoryName ?? "-",
    },
    {
      key: "quantity",
      sortable: true,
      header: mergedLabels.quantity,
      cell: (request) => request.quantity,
    },
    {
      key: "priority",
      sortable: true,
      header: mergedLabels.priority,
      cell: (request) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityTone(request.priority)}`}
        >
          {requestPriorityLabelMap[request.priority]}
        </span>
      ),
    },
    {
      key: "status",
      sortable: true,
      header: mergedLabels.status,
      cell: (request) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(request.status)}`}
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
      {urgentNotifications.length > 0 ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-[0_18px_50px_rgba(127,29,29,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
                Bảng yêu cầu khẩn cấp
              </p>
              <h2 className="mt-1 text-xl font-black text-red-950">
                {
                  urgentNotifications.filter(
                    (notification) => !notification.acknowledgedAt,
                  ).length
                }{" "}
                yêu cầu chưa xác nhận
              </h2>
              <p className="mt-1 text-sm text-red-900/75">
                Hãy xử lí ngay lập tức nếu có thể
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsUrgentPanelOpen((current) => !current)}
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white"
              >
                {isUrgentPanelOpen ? "Thu gọn" : "Mở bảng"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setUrgentNotifications((currentNotifications) =>
                    currentNotifications.filter(
                      (notification) =>
                        !isFinalRequestStatus(notification.status),
                    ),
                  )
                }
                className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-red-800 ring-1 ring-red-200"
              >
                Dọn yêu cầu đã kết thúc
              </button>
            </div>
          </div>
          {isUrgentPanelOpen ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {urgentNotifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-xl border bg-white p-4 ${notification.acknowledgedAt ? "border-red-100 opacity-75" : "border-red-300 shadow-sm"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-red-950">
                      Phòng {notification.roomNumber}
                    </p>
                    <p className="mt-1 text-sm text-red-900">
                      {notification.displayName}
                    </p>
                    <p className="mt-1 text-xs text-red-900/70">
                      {notification.guestName ?? "Khách"} -{" "}
                      {formatOpsDateTime(notification.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-black ${notification.acknowledgedAt ? "bg-zinc-100 text-zinc-700" : "bg-red-700 text-white"}`}
                  >
                    {notification.acknowledgedAt
                      ? "Đã xác nhận"
                      : "Chưa xác nhận"}
                  </span>
                </div>
                {(notification.latestNote ?? notification.description) ? (
                  <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-950">
                    {notification.latestNote ?? notification.description}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      acknowledgeUrgentRequest(notification.id);
                      openRequestRow(notification);
                    }}
                    className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black uppercase tracking-wide text-white"
                  >
                    Xử lý ngay
                  </button>
                  {!notification.acknowledgedAt ? (
                    <button
                      type="button"
                      onClick={() => acknowledgeUrgentRequest(notification.id)}
                      className="rounded-lg bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-red-800 ring-1 ring-red-200"
                    >
                      Xác nhận đã thấy
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeUrgentRequest(notification.id)}
                    className="rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide text-red-800 hover:bg-red-100"
                  >
                    Ẩn khỏi bảng
                  </button>
                </div>
              </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-4 md:grid-cols-2 xl:grid-cols-6"
      >
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
              {summary.statuses[status] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <DataTable
        columns={requestColumns}
        data={displayedRequests}
        getRowKey={(request) => request.id}
        emptyMessage={mergedLabels.emptyState}
        minWidth="1180px"
        header={requestTableHeader}
        sort={{
          key: sortState.key,
          direction: sortState.direction,
          onSortChange: (key, direction) =>
            setSortState({ key: key as RequestSortKey, direction }),
        }}
        onRowClick={openRequestRow}
        pagination={
          page && pageSize
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
            : undefined
        }
      />

      {selectedRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-detail-modal-title"
          onClick={() => setSelectedRow(null)}
        >
          <section
            className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${isFinalRequestStatus(selectedRequest?.status ?? selectedRow.status) ? "max-w-5xl" : "max-w-6xl"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2
                id="request-detail-modal-title"
                className="text-2xl font-semibold text-[var(--primary)]"
              >
                {mergedLabels.requestDetail}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-sm font-semibold text-[var(--primary)]"
              >
                {mergedLabels.closeDetail}
              </button>
            </div>
            {renderRequestDetail(selectedRow, detailRequest)}
          </section>
        </div>
      ) : null}
    </div>
  );
}
