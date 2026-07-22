"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  type FormEvent,
  startTransition,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { z } from "zod";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSortDirection,
} from "@/components/ui/data-table";
import { HttpError } from "@/core/http/http-error";
import { VsIcon } from "../../../../../_components/vs-icon";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  getGuestQrUrl,
  getQrStatus,
  getQrValue,
  getRoomNumber,
} from "./room-qr-utils";

type Props = { hotelId: string; initialRooms: HotelRoomSummary[] };
type RoomSortKey =
  | "roomNumber"
  | "type"
  | "floor"
  | "price"
  | "maxActiveGuestDevices"
  | "qr";

type RoomFormState = {
  id?: string;
  roomNumber: string;
  floor: string;
  type: string;
  price: string;
  maxActiveGuestDevices: string;
  status: string;
};

type RoomFormErrors = Partial<Record<keyof Omit<RoomFormState, "id">, string>>;

const roomTypeOptions = ["Deluxe", "Superior", "Suite", "Family", "Standard"];

function randomRoomForm(): RoomFormState {
  const roomNumber = String(Math.floor(100 + Math.random() * 899));
  return {
    roomNumber,
    floor: roomNumber.slice(0, 1),
    type: roomTypeOptions[Math.floor(Math.random() * roomTypeOptions.length)],
    price: String(Math.floor(8 + Math.random() * 22) * 100000),
    maxActiveGuestDevices: "",
    status: "AVAILABLE",
  };
}

const roomPageSizeOptions = [10, 25, 50];

const roomFormSchema = z.object({
  roomNumber: z.string().trim().min(1, "Vui lòng nhập số phòng."),
  floor: z.string(),
  type: z.string(),
  price: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập giá phòng.")
    .regex(/^\d+$/, "Giá phòng chỉ bao gồm chữ số.")
    .refine((value) => Number(value) > 0, "Giá phòng phải lớn hơn 0."),
  maxActiveGuestDevices: z
    .string()
    .trim()
    .regex(/^\d*$/, "Số thiết bị chỉ bao gồm chữ số.")
    .refine(
      (value) => value === "" || Number(value) >= 1,
      "Tối thiểu 1 thiết bị.",
    ),
});

const qrStatusMeta: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Đang hoạt động", className: "bg-green-100 text-green-700" },
  INACTIVE: { label: "Tạm tắt", className: "bg-slate-100 text-slate-700" },
  DISABLED: { label: "Tạm tắt", className: "bg-slate-100 text-slate-700" },
  REVOKED: { label: "Đã thu hồi", className: "bg-red-100 text-red-700" },
  EXPIRED: { label: "Hết hạn", className: "bg-amber-100 text-amber-800" },
};

const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true,
});

function subscribeClientOriginChange() {
  return () => undefined;
}

function getClientOriginSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function getServerOriginSnapshot(): string {
  return "";
}

function useClientOrigin(): string {
  return useSyncExternalStore(
    subscribeClientOriginChange,
    getClientOriginSnapshot,
    getServerOriginSnapshot,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTechnicalMessage(message: string): boolean {
  return /PRISMA_|Prisma|Record to update not found|Foreign key constraint|Unique constraint/i.test(
    message,
  );
}

function getNestedMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const candidates = [value.detail, value.message, value.errorMessage];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      !isTechnicalMessage(candidate)
    ) {
      return candidate.trim();
    }
  }

  return getNestedMessage(value.data) ?? getNestedMessage(value.error);
}

function getBusinessErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpError) {
    return getNestedMessage(error.data) ?? fallback;
  }

  if (
    error instanceof Error &&
    error.message &&
    !isTechnicalMessage(error.message)
  ) {
    return error.message;
  }

  return fallback;
}

function roomSearchText(room: HotelRoomSummary): string {
  return [
    room.roomNumber,
    room.floor,
    room.type,
    room.status,
    room.maxActiveGuestDevices,
    getQrStatus(room),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getResolvedMaxActiveGuestDevices(room: HotelRoomSummary): number {
  return room.maxActiveGuestDevices ?? 3;
}

function getActiveGuestDeviceCount(room: HotelRoomSummary): number {
  return room.activeGuestDeviceCount ?? 0;
}

function getQrMeta(room: HotelRoomSummary) {
  const status = getQrStatus(room);
  return (
    qrStatusMeta[status] ?? {
      label: status,
      className: "bg-slate-100 text-slate-700",
    }
  );
}

function isQrActive(room: HotelRoomSummary): boolean {
  return getQrStatus(room) === "ACTIVE";
}

function canActivateQr(room: HotelRoomSummary): boolean {
  const qrStatus = getQrStatus(room);

  return qrStatus !== "ACTIVE" && qrStatus !== "REVOKED";
}

function canDeactivateQr(room: HotelRoomSummary): boolean {
  return Boolean(room.qr) && isQrActive(room);
}

function getRoomPrice(room: HotelRoomSummary): number | null {
  if (typeof room.price === "number")
    return Number.isFinite(room.price) ? room.price : null;
  if (typeof room.price === "string" && room.price.trim()) {
    const normalizedPrice = room.price.replace(/\D/g, "");
    const parsed = Number(normalizedPrice);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRoomStatusMeta(room: HotelRoomSummary) {
  const status = room.status?.trim().toUpperCase() || "AVAILABLE";
  if (status === "BLOCKED") {
    return { label: "Đã khóa", className: "bg-slate-200 text-slate-800" };
  }
  if (status === "OCCUPIED") {
    return { label: "Đang ở", className: "bg-blue-100 text-blue-700" };
  }
  if (status === "PROCESSING") {
    return { label: "Chờ dọn", className: "bg-amber-100 text-amber-800" };
  }
  if (status === "MAINTENANCE") {
    return { label: "Bảo trì", className: "bg-red-100 text-red-700" };
  }
  return { label: "Trống", className: "bg-green-100 text-green-700" };
}

function toRawPriceDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPriceInput(value: string): string {
  const rawDigits = toRawPriceDigits(value);

  if (!rawDigits) return "";

  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
    Number(rawDigits),
  );
}

function formatVnd(value: string | number | null | undefined): string {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(toRawPriceDigits(value))
        : NaN;

  if (!Number.isFinite(amount)) return "--";

  return (
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
      amount,
    ) + " ₫"
  );
}

function roomToForm(room: HotelRoomSummary): RoomFormState {
  return {
    id: room.id,
    roomNumber: room.roomNumber ?? "",
    floor: room.floor ?? "",
    type: room.type ?? "",
    price: getRoomPrice(room) === null ? "" : String(getRoomPrice(room)),
    maxActiveGuestDevices:
      room.maxActiveGuestDevices === null ||
      room.maxActiveGuestDevices === undefined
        ? ""
        : String(room.maxActiveGuestDevices),
    status: room.status?.trim().toUpperCase() || "AVAILABLE",
  };
}

function getRoomFormErrors(form: RoomFormState): RoomFormErrors {
  const result = roomFormSchema.safeParse(form);
  if (result.success) return {};

  const fieldErrors = result.error.flatten().fieldErrors;
  return {
    roomNumber: fieldErrors.roomNumber?.[0],
    floor: fieldErrors.floor?.[0],
    type: fieldErrors.type?.[0],
    price: fieldErrors.price?.[0],
    maxActiveGuestDevices: fieldErrors.maxActiveGuestDevices?.[0],
  };
}

function compareRooms(
  left: HotelRoomSummary,
  right: HotelRoomSummary,
  key: RoomSortKey,
  direction: DataTableSortDirection,
): number {
  let result = 0;

  if (key === "price") {
    result = (getRoomPrice(left) ?? 0) - (getRoomPrice(right) ?? 0);
  } else if (key === "maxActiveGuestDevices") {
    result =
      getResolvedMaxActiveGuestDevices(left) -
      getResolvedMaxActiveGuestDevices(right);
  } else if (key === "qr") {
    result = getQrStatus(left).localeCompare(getQrStatus(right), "vi", {
      sensitivity: "base",
    });
  } else if (key === "roomNumber") {
    result = getRoomNumber(left).localeCompare(getRoomNumber(right), "vi", {
      numeric: true,
      sensitivity: "base",
    });
  } else {
    result = String(left[key] ?? "").localeCompare(
      String(right[key] ?? ""),
      "vi",
      { numeric: true, sensitivity: "base" },
    );
  }

  return direction === "asc" ? result : -result;
}

function roomInputClass(hasError: boolean): string {
  return `min-h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none transition ${
    hasError
      ? "border-[var(--error)] shadow-[0_0_0_1px_var(--error)] focus:border-[var(--error)]"
      : "border-[var(--outline-variant)] focus:border-[var(--primary)]"
  }`;
}

function RoomFieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--error)]">
      <VsIcon name="error" className="text-[15px]" />
      {message}
    </span>
  );
}

function showLoading(title: string) {
  void Swal.fire({
    title,
    text: "Vui lòng chờ trong giây lát.",
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

export function OwnerRoomsClient({ hotelId, initialRooms }: Props) {
  const router = useRouter();
  const qrCodeRef = useRef<SVGSVGElement | null>(null);
  const [rooms, setRooms] = useState(initialRooms);
  const [query, setQuery] = useState("");
  const [qrStatusFilter, setQrStatusFilter] = useState("");
  const [roomStatusFilter, setRoomStatusFilter] = useState("");
  const [roomForm, setRoomForm] = useState<RoomFormState | null>(null);
  const [sortKey, setSortKey] = useState<RoomSortKey>("roomNumber");
  const [sortDirection, setSortDirection] =
    useState<DataTableSortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(roomPageSizeOptions[0]);
  const [roomFormErrors, setRoomFormErrors] = useState<RoomFormErrors>({});
  const [selectedQrRoom, setSelectedQrRoom] = useState<HotelRoomSummary | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkQrBusy, setIsBulkQrBusy] = useState(false);
  const clientOrigin = useClientOrigin();

  const filteredRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedQrStatus = qrStatusFilter.trim().toUpperCase();
    const normalizedRoomStatus = roomStatusFilter.trim().toUpperCase();

    return rooms.filter((room) => {
      const matchesQuery =
        !normalizedQuery || roomSearchText(room).includes(normalizedQuery);
      const matchesQrStatus =
        !normalizedQrStatus || getQrStatus(room) === normalizedQrStatus;
      const currentRoomStatus = room.status?.trim().toUpperCase() || "AVAILABLE";
      const matchesRoomStatus =
        !normalizedRoomStatus || currentRoomStatus === normalizedRoomStatus;
      return matchesQuery && matchesQrStatus && matchesRoomStatus;
    });
  }, [query, qrStatusFilter, roomStatusFilter, rooms]);

  const sortedRooms = useMemo(
    () =>
      [...filteredRooms].sort((left, right) =>
        compareRooms(left, right, sortKey, sortDirection),
      ),
    [filteredRooms, sortDirection, sortKey],
  );

  const stats = useMemo(() => {
    const activeQr = rooms.filter(isQrActive).length;
    const inactiveQr = rooms.length - activeQr;
    const floors = new Set(
      rooms.map((room) => room.floor?.trim()).filter(Boolean),
    ).size;

    return [
      {
        label: "Tổng số phòng",
        value: String(rooms.length),
        icon: "hotel",
        className: "text-[var(--primary)]",
      },
      {
        label: "QR hoạt động",
        value: String(activeQr),
        icon: "qr_code",
        className: "text-green-700",
      },
      {
        label: "QR tạm tắt",
        value: String(inactiveQr),
        icon: "block",
        className: "text-[var(--error)]",
      },
      {
        label: "Số tầng",
        value: String(floors),
        icon: "meeting_room",
        className: "text-[var(--secondary)]",
      },
    ];
  }, [rooms]);

  async function refreshRooms() {
    const roomsPage = (
      await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
        `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms`,
        { method: "GET" },
      )
    ).data;
    setRooms(roomsPage.items);
    startTransition(() => {
      router.refresh();
    });
  }

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateQrStatusFilter(value: string) {
    setQrStatusFilter(value);
    setPage(1);
  }

  function updateSort(nextKey: string, nextDirection: DataTableSortDirection) {
    setSortKey(nextKey as RoomSortKey);
    setSortDirection(nextDirection);
    setPage(1);
  }

  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  function openCreateRoom() {
    setRoomForm(randomRoomForm());
    setRoomFormErrors({});
  }

  function openEditRoom(room: HotelRoomSummary) {
    setRoomForm(roomToForm(room));
    setRoomFormErrors({});
  }

  function closeRoomForm() {
    setRoomForm(null);
    setRoomFormErrors({});
  }

  function updateRoomFormField<Key extends keyof Omit<RoomFormState, "id">>(
    field: Key,
    value: RoomFormState[Key],
  ) {
    setRoomForm((current) =>
      current ? { ...current, [field]: value } : current,
    );
    setRoomFormErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomForm) return;

    const validationErrors = getRoomFormErrors(roomForm);
    if (Object.values(validationErrors).some(Boolean)) {
      setRoomFormErrors(validationErrors);
      return;
    }

    const price = Number(roomForm.price);
    const isEditing = Boolean(roomForm.id);
    const confirmed = await Swal.fire({
      icon: "question",
      title: isEditing ? "Lưu thay đổi phòng?" : "Tạo phòng mới?",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#767684",
    });
    if (!confirmed.isConfirmed) return;

    setIsSaving(true);
    try {
      showLoading(isEditing ? "Đang lưu phòng" : "Đang tạo phòng");
      const body = {
        roomNumber: roomForm.roomNumber.trim(),
        floor: roomForm.floor.trim() || undefined,
        type: roomForm.type.trim() || undefined,
        price,
        status: roomForm.status,
        ...(roomForm.maxActiveGuestDevices.trim()
          ? { maxActiveGuestDevices: Number(roomForm.maxActiveGuestDevices) }
          : isEditing
            ? { maxActiveGuestDevices: null }
            : {}),
      };
      const path = isEditing
        ? `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(roomForm.id ?? "")}`
        : `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms`;

      await requestInternalApiEnvelope<HotelRoomSummary>(path, {
        method: isEditing ? "PATCH" : "POST",
        body,
      });
      closeRoomForm();
      await refreshRooms();
      await toast.fire({
        icon: "success",
        title: isEditing ? "Đã cập nhật phòng" : "Đã tạo phòng",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: isEditing ? "Không thể cập nhật phòng" : "Không thể tạo phòng",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function updateRoomFromQrAction(
    room: HotelRoomSummary,
    action: "rotate" | "activate" | "deactivate",
  ) {
    const actionTitle =
      action === "rotate"
        ? "Đổi mã QR?"
        : action === "activate"
          ? "Kích hoạt QR?"
          : "Tạm tắt QR?";
    const confirmed = await Swal.fire({
      icon: "question",
      title: actionTitle,
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#767684",
    });
    if (!confirmed.isConfirmed) return;

    try {
      showLoading(action === "rotate" ? "Đang đổi mã QR" : "Đang cập nhật QR");
      const updated = (
        await requestInternalApiEnvelope<HotelRoomSummary>(
          `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/qr/${action}`,
          { method: "POST" },
        )
      ).data;

      setRooms((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedQrRoom((current) =>
        current?.id === updated.id ? updated : current,
      );
      await refreshRooms();
      await toast.fire({ icon: "success", title: "Đã cập nhật QR" });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật QR",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    }
  }

  async function toggleRoomBlocked(room: HotelRoomSummary) {
    const isBlocked = room.status?.trim().toUpperCase() === "BLOCKED";
    const confirmation = await Swal.fire({
      icon: isBlocked ? "question" : "warning",
      title: isBlocked
        ? `Mở khóa phòng ${getRoomNumber(room)}?`
        : `Khóa phòng ${getRoomNumber(room)}?`,
      text: isBlocked
        ? "Phòng sẽ trở lại trạng thái TRỐNG và có thể được sử dụng."
        : "Phòng sẽ không thể được đặt, gán booking hoặc check-in cho đến khi mở khóa.",
      showCancelButton: true,
      confirmButtonText: isBlocked ? "Mở khóa phòng" : "Khóa phòng",
      cancelButtonText: "Hủy",
      confirmButtonColor: isBlocked ? "#173d34" : "#ba1a1a",
    });
    if (!confirmation.isConfirmed) return;

    try {
      showLoading(isBlocked ? "Đang mở khóa phòng" : "Đang khóa phòng");
      await requestInternalApiEnvelope(
        `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}`,
        { method: "PATCH", body: { status: isBlocked ? "AVAILABLE" : "BLOCKED" } },
      );
      await refreshRooms();
      await toast.fire({
        icon: "success",
        title: isBlocked ? "Đã mở khóa phòng" : "Đã khóa phòng",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái phòng",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    }
  }

  async function updateSingleRoomStatus(
    room: HotelRoomSummary,
    newStatus: string,
  ) {
    const currentStatus = room.status?.trim().toUpperCase() || "AVAILABLE";
    if (currentStatus === newStatus) return;

    try {
      showLoading("Đang cập nhật trạng thái phòng...");
      await requestInternalApiEnvelope(
        `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}`,
        { method: "PATCH", body: { status: newStatus } },
      );
      await refreshRooms();
      await toast.fire({
        icon: "success",
        title: "Đã cập nhật trạng thái phòng",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái phòng",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    }
  }

  function getRoomsWithQr(): HotelRoomSummary[] {
    return rooms.filter((room) => Boolean(getQrValue(room)));
  }

  function downloadSelectedQrRoom(): void {
    if (!selectedQrRoom || !getQrValue(selectedQrRoom) || !qrCodeRef.current) {
      void Swal.fire({
        icon: "error",
        title: "Chưa có mã QR public",
        text: "Vui lòng kích hoạt hoặc đổi mã QR trước.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const svgMarkup = new XMLSerializer().serializeToString(qrCodeRef.current);
    const svgBlob = new Blob([svgMarkup], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);
    const qrImage = new window.Image();

    qrImage.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 650;
      canvas.height = 540;

      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(svgUrl);
        void Swal.fire({
          icon: "error",
          title: "Không thể tải mã QR",
          confirmButtonColor: "#00003c",
        });
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#c6c5d5";
      context.lineWidth = 2;
      context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

      context.fillStyle = "#00003c";
      context.font = "700 42px Arial, sans-serif";
      context.textAlign = "center";
      context.fillText(
        `Phòng #${getRoomNumber(selectedQrRoom)}`,
        canvas.width / 2,
        88,
      );

      context.drawImage(qrImage, 145, 138, 360, 360);

      const downloadLink = document.createElement("a");
      downloadLink.href = canvas.toDataURL("image/png");
      downloadLink.download = `qr-phong-${getRoomNumber(selectedQrRoom)}.png`;
      downloadLink.click();

      URL.revokeObjectURL(svgUrl);
    };

    qrImage.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      void Swal.fire({
        icon: "error",
        title: "Không thể tải mã QR",
        confirmButtonColor: "#00003c",
      });
    };

    qrImage.src = svgUrl;
  }

  async function exportAllQrCodes() {
    const qrRooms = getRoomsWithQr();

    if (!qrRooms.length) {
      await Swal.fire({
        icon: "warning",
        title: "Chưa có mã QR",
        text: "Không có phòng nào có QR để xuất.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const confirmed = await Swal.fire({
      icon: "question",
      title: `Xuất ${qrRooms.length} mã QR?`,
      text: "Hệ thống sẽ chuyển sang trang in/lưu PDF gồm toàn bộ QR hiện có.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Xuất QR",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#767684",
    });

    if (!confirmed.isConfirmed) {
      return;
    }

    router.push(`/owner/hotels/${hotelId}/rooms/qr-export`);
  }
  async function rotateAllQrCodes() {
    const qrRooms = getRoomsWithQr();
    if (!qrRooms.length) {
      await Swal.fire({
        icon: "warning",
        title: "Chưa có mã QR",
        text: "Không có phòng nào có QR để đổi mã.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const confirmed = await Swal.fire({
      icon: "warning",
      title: `Đổi toàn bộ ${qrRooms.length} mã QR?`,
      text: "Mã QR cũ sẽ không còn dùng được. Hãy xuất/in lại QR mới sau khi đổi.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đổi toàn bộ",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#ba1a1a",
      cancelButtonColor: "#767684",
    });
    if (!confirmed.isConfirmed) return;

    setIsBulkQrBusy(true);
    try {
      showLoading("Đang đổi toàn bộ QR");
      for (const room of qrRooms) {
        await requestInternalApiEnvelope<HotelRoomSummary>(
          `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/qr/rotate`,
          { method: "POST" },
        );
      }
      await refreshRooms();
      await Swal.fire({
        icon: "success",
        title: "Đã đổi toàn bộ QR",
        text: "Vui lòng xuất/in lại bộ QR mới.",
        confirmButtonColor: "#00003c",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể đổi toàn bộ QR",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    } finally {
      setIsBulkQrBusy(false);
    }
  }

  async function activateAllQrCodes() {
    const targetRooms = rooms.filter(canActivateQr);
    if (!targetRooms.length) {
      await Swal.fire({
        icon: "info",
        title: "QR đã hoạt động",
        text: "Không còn phòng nào cần kích hoạt QR.",
        confirmButtonColor: "#00003c",
      });
      return;
    }

    const confirmed = await Swal.fire({
      icon: "question",
      title: `Kích hoạt ${targetRooms.length} mã QR?`,
      text: "Phòng chưa có QR sẽ được tạo mã mới, phòng có QR tạm tắt sẽ được bật lại.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Kích hoạt tất cả",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#173d34",
      cancelButtonColor: "#767684",
    });
    if (!confirmed.isConfirmed) return;

    setIsBulkQrBusy(true);
    try {
      showLoading("Đang kích hoạt toàn bộ QR");
      for (const room of targetRooms) {
        await requestInternalApiEnvelope<HotelRoomSummary>(
          `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/qr/activate`,
          { method: "POST" },
        );
      }
      await refreshRooms();
      await Swal.fire({
        icon: "success",
        title: "Đã kích hoạt QR",
        text: "Bạn có thể xuất/in bộ QR mới từ trang này.",
        confirmButtonColor: "#00003c",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể kích hoạt toàn bộ QR",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    } finally {
      setIsBulkQrBusy(false);
    }
  }

  const roomColumns: DataTableColumn<HotelRoomSummary>[] = [
    {
      key: "roomNumber",
      sortable: true,
      header: "S\u1ed1 ph\u00f2ng",
      className: "px-8 py-5 font-bold text-[var(--primary)]",
      headerClassName: "px-8 py-5",
      cell: (room) => "#" + getRoomNumber(room),
    },
    {
      key: "type",
      sortable: true,
      header: "Lo\u1ea1i ph\u00f2ng",
      className: "px-6 py-5 text-[var(--on-surface)]",
      headerClassName: "px-6 py-5",
      cell: (room) => room.type ?? "--",
    },
    {
      key: "floor",
      sortable: true,
      header: "T\u1ea7ng",
      className: "px-6 py-5 text-[var(--on-surface-variant)]",
      headerClassName: "px-6 py-5",
      cell: (room) => room.floor ?? "--",
    },
    {
      key: "price",
      sortable: true,
      header: "Gi\u00e1 ph\u00f2ng",
      className: "px-6 py-5 font-semibold text-[var(--on-surface)]",
      headerClassName: "px-6 py-5",
      cell: (room) => formatVnd(room.price),
    },
    {
      key: "maxActiveGuestDevices",
      sortable: true,
      header: "Thiết bị",
      className: "whitespace-nowrap px-4 py-5 text-[var(--on-surface)]",
      headerClassName: "px-4 py-5",
      cell: (room) =>
        `${getActiveGuestDeviceCount(room)} / ${getResolvedMaxActiveGuestDevices(room)}`,
    },
    {
      key: "status",
      header: "Trạng thái phòng",
      className: "px-4 py-5",
      headerClassName: "px-4 py-5",
      cell: (room) => {
        const currentStatus = room.status?.trim().toUpperCase() || "AVAILABLE";
        const statusMeta = getRoomStatusMeta(room);
        const isOccupied = currentStatus === "OCCUPIED";

        if (isOccupied) {
          return (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.03em] ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          );
        }

        return (
          <select
            value={currentStatus}
            onChange={(e) => void updateSingleRoomStatus(room, e.target.value)}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.03em] outline-none transition border-0 ${statusMeta.className}`}
          >
            <option value="AVAILABLE">Trống</option>
            <option value="PROCESSING">Chờ dọn</option>
            <option value="MAINTENANCE">Bảo trì</option>
            <option value="BLOCKED">Đã khóa</option>
          </select>
        );
      },
    },
    {
      key: "qr",
      sortable: true,
      header: "QR",
      className: "px-4 py-5",
      headerClassName: "px-4 py-5",
      cell: (room) => {
        const qrMeta = getQrMeta(room);
        const showMissingQrHint = !getQrValue(room);
        return (
          <div className="space-y-1.5">
            <span
              className={[
                "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.03em]",
                qrMeta.className,
              ].join(" ")}
            >
              {qrMeta.label}
            </span>
            {showMissingQrHint ? (
              <p className="max-w-[180px] truncate text-[11px] font-medium leading-4 text-[var(--outline)]">
                {"Chưa tạo mã QR"}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Thao tác",
      className: "whitespace-nowrap px-4 py-5 text-right",
      headerClassName: "px-4 py-5 text-right",
      cell: (room) => {
        const isOccupied = room.status?.trim().toUpperCase() === "OCCUPIED";
        const isBlocked = room.status?.trim().toUpperCase() === "BLOCKED";
        const showActivate = canActivateQr(room);
        const showDeactivate = canDeactivateQr(room);

        return (
          <div className="flex justify-end items-center gap-1">
            {/* Slot 1: Lock / Unlock Room */}
            {!isOccupied ? (
              <button
                type="button"
                title={isBlocked ? "Mở khóa phòng" : "Khóa phòng"}
                onClick={() => void toggleRoomBlocked(room)}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                  isBlocked
                    ? "text-emerald-700 hover:bg-emerald-50"
                    : "text-rose-700 hover:bg-rose-50"
                }`}
              >
                <VsIcon
                  name={isBlocked ? "lock_open" : "lock"}
                  className="text-lg"
                />
              </button>
            ) : (
              <div className="h-9 w-9 shrink-0" />
            )}

            {/* Slot 2: Edit Room */}
            <button
              type="button"
              title="Chỉnh sửa phòng"
              onClick={() => openEditRoom(room)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]"
            >
              <VsIcon name="edit" className="text-lg" />
            </button>

            {/* Slot 3: Show QR */}
            <button
              type="button"
              title="Xem mã QR"
              onClick={() => setSelectedQrRoom(room)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]"
            >
              <VsIcon name="qr_code" className="text-lg" />
            </button>

            {/* Slot 4: Rotate QR */}
            <button
              type="button"
              title="Đổi / Xoay mã QR"
              onClick={() => void updateRoomFromQrAction(room, "rotate")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100"
            >
              <VsIcon name="sync" className="text-lg" />
            </button>

            {/* Slot 5: QR Status Action (Deactivate or Activate) */}
            {showDeactivate ? (
              <button
                type="button"
                title="Tạm tắt QR"
                onClick={() => void updateRoomFromQrAction(room, "deactivate")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-amber-700 transition hover:bg-amber-50"
              >
                <VsIcon name="power_settings_new" className="text-lg" />
              </button>
            ) : showActivate ? (
              <button
                type="button"
                title="Kích hoạt QR"
                onClick={() => void updateRoomFromQrAction(room, "activate")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50"
              >
                <VsIcon name="check_circle" className="text-lg" />
              </button>
            ) : (
              <div className="h-9 w-9 shrink-0" />
            )}
          </div>
        );
      },
    },
  ];

  const tableHeader = (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--outline-variant)] p-5">
      <label className="relative min-w-[240px] flex-1">
        <span className="sr-only">Tìm kiếm phòng</span>
        <VsIcon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[var(--outline)]"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Tìm số phòng, loại phòng hoặc tầng..."
          className="min-h-12 w-full rounded-xl border-0 bg-[var(--surface-container-low)] pl-10 pr-4 text-sm outline-none ring-1 ring-transparent transition focus:ring-[var(--primary)]"
        />
      </label>
      <select
        value={roomStatusFilter}
        onChange={(event) => {
          setRoomStatusFilter(event.target.value);
          setPage(1);
        }}
        className="min-h-12 min-w-[180px] rounded-xl border-0 bg-[var(--surface-container-low)] px-4 text-sm outline-none ring-1 ring-transparent transition focus:ring-[var(--primary)]"
      >
        <option value="">Trạng thái: Tất cả</option>
        <option value="AVAILABLE">Trống (Sẵn sàng)</option>
        <option value="OCCUPIED">Đang ở</option>
        <option value="PROCESSING">Chờ dọn</option>
        <option value="MAINTENANCE">Bảo trì</option>
        <option value="BLOCKED">Đã khóa</option>
      </select>
      <select
        value={qrStatusFilter}
        onChange={(event) => updateQrStatusFilter(event.target.value)}
        className="min-h-12 min-w-[180px] rounded-xl border-0 bg-[var(--surface-container-low)] px-4 text-sm outline-none ring-1 ring-transparent transition focus:ring-[var(--primary)]"
      >
        <option value="">QR: Tất cả</option>
        <option value="ACTIVE">Đang hoạt động</option>
        <option value="INACTIVE">Tạm tắt</option>
        <option value="EXPIRED">Hết hạn</option>
      </select>
    </div>
  );

  return (
    <section
      className="space-y-8"
      data-api-room-count={initialRooms.length}
      data-hotel-id={hotelId}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
            Phòng & lưu trú
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-[var(--primary)]">
            Quản lý phòng và lưu trú
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-[var(--on-surface-variant)]">
            Quản lý thông tin phòng, trạng thái sử dụng, mã QR và xem nhanh khách đang lưu trú trong một màn hình.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateRoom}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-sm font-bold text-[var(--on-primary)] shadow-lg shadow-[color:rgba(0,0,60,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-xl"
        >
          <VsIcon name="add_circle" className="text-lg" />
          Thêm phòng mới
        </button>
      </div>

      <section className="space-y-5">
        <div className="overflow-hidden rounded-3xl border border-[#d7bd61]/40 bg-[linear-gradient(135deg,#173d34,#25483f_52%,#f4d36f)] p-[1px] shadow-[0_24px_70px_rgba(31,61,53,0.18)]">
          <div className="grid gap-5 rounded-3xl bg-[#f9f4e8] p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8a6a13]">
                QR Command Center
              </p>
              <h2 className="mt-2 text-2xl font-black text-[#173d34]">
                Kích hoạt, xuất và đổi toàn bộ mã QR
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e6a62]">
                Tạo/kích hoạt QR cho tất cả phòng trước khi check-in, xuất bộ QR
                để in, hoặc xoay vòng mã để vô hiệu hóa các bản in cũ. Mọi thao
                tác hàng loạt đều yêu cầu xác nhận.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void activateAllQrCodes()}
                disabled={isBulkQrBusy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#173d34] px-5 text-sm font-black text-white shadow-[0_14px_32px_rgba(23,61,52,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <VsIcon name="task_alt" className="text-[20px]" />
                Kích hoạt toàn bộ QR
              </button>
              <button
                type="button"
                onClick={() => void exportAllQrCodes()}
                disabled={isBulkQrBusy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#25483f] shadow-[0_14px_32px_rgba(31,61,53,0.14)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <VsIcon name="download" className="text-[20px]" />
                Xuất toàn bộ QR
              </button>
              <button
                type="button"
                onClick={() => void rotateAllQrCodes()}
                disabled={isBulkQrBusy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ba1a1a] px-5 text-sm font-black text-white shadow-[0_14px_32px_rgba(186,26,26,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <VsIcon name="sync" className="text-[20px]" />
                Đổi toàn bộ QR
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <article
              key={item.label}
              className="rounded-2xl border border-[var(--surface-container)] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-colors hover:bg-[var(--surface-bright)]"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
                {item.label}
              </p>
              <div className="flex items-end justify-between gap-4">
                <strong className={`text-4xl font-bold ${item.className}`}>
                  {item.value}
                </strong>
                <VsIcon
                  name={item.icon}
                  className={`text-4xl ${item.className} opacity-35`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <DataTable
        columns={roomColumns}
        data={sortedRooms}
        getRowKey={(room) => room.id}
        emptyMessage="Chưa có phòng phù hợp với bộ lọc hiện tại."
        minWidth="980px"
        rowClassName={() => "group"}
        header={tableHeader}
        sort={{
          key: sortKey,
          direction: sortDirection,
          onSortChange: updateSort,
        }}
        pagination={{
          page,
          pageSize,
          pageSizeOptions: roomPageSizeOptions,
          totalItems: sortedRooms.length,
          onPageChange: setPage,
          onPageSizeChange: updatePageSize,
        }}
      />

      {roomForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <form
            noValidate
            onSubmit={saveRoom}
            className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
                  {roomForm.id ? "Update room" : "Create room"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--primary)]">
                  {roomForm.id
                    ? `Chỉnh sửa phòng #${roomForm.roomNumber || "--"}`
                    : "Tạo phòng mới"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeRoomForm}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]"
                title="Đóng"
              >
                <VsIcon name="close" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Số phòng
                </span>
                <input
                  value={roomForm.roomNumber}
                  onChange={(event) =>
                    updateRoomFormField("roomNumber", event.target.value)
                  }
                  aria-invalid={Boolean(roomFormErrors.roomNumber)}
                  className={roomInputClass(Boolean(roomFormErrors.roomNumber))}
                />
                <RoomFieldError message={roomFormErrors.roomNumber} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Tầng
                </span>
                <input
                  value={roomForm.floor}
                  onChange={(event) =>
                    updateRoomFormField("floor", event.target.value)
                  }
                  aria-invalid={Boolean(roomFormErrors.floor)}
                  className={roomInputClass(Boolean(roomFormErrors.floor))}
                />
                <RoomFieldError message={roomFormErrors.floor} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Loại phòng
                </span>
                <input
                  value={roomForm.type}
                  onChange={(event) =>
                    updateRoomFormField("type", event.target.value)
                  }
                  aria-invalid={Boolean(roomFormErrors.type)}
                  className={roomInputClass(Boolean(roomFormErrors.type))}
                />
                <RoomFieldError message={roomFormErrors.type} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Giá phòng
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatPriceInput(roomForm.price)}
                  onChange={(event) =>
                    updateRoomFormField(
                      "price",
                      toRawPriceDigits(event.target.value),
                    )
                  }
                  onBeforeInput={(event) => {
                    if (event.data && /\D/.test(event.data))
                      event.preventDefault();
                  }}
                  onPaste={(event) => {
                    if (/\D/.test(event.clipboardData.getData("text")))
                      event.preventDefault();
                  }}
                  aria-invalid={Boolean(roomFormErrors.price)}
                  className={roomInputClass(Boolean(roomFormErrors.price))}
                />
                <RoomFieldError message={roomFormErrors.price} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Thiết bị tối đa
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Mặc định 3"
                  value={roomForm.maxActiveGuestDevices}
                  onChange={(event) =>
                    updateRoomFormField(
                      "maxActiveGuestDevices",
                      event.target.value.replace(/\D/g, ""),
                    )
                  }
                  aria-invalid={Boolean(roomFormErrors.maxActiveGuestDevices)}
                  className={roomInputClass(
                    Boolean(roomFormErrors.maxActiveGuestDevices),
                  )}
                />
                <p className="text-[11px] font-medium text-[var(--outline)]">
                  Để trống để hệ thống dùng mặc định 3.
                </p>
                <RoomFieldError
                  message={roomFormErrors.maxActiveGuestDevices}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Trạng thái phòng
                </span>
                <select
                  value={roomForm.status}
                  onChange={(event) =>
                    updateRoomFormField("status", event.target.value)
                  }
                  className="h-12 w-full rounded-xl border-0 bg-[var(--surface-container-low)] px-3 text-sm font-semibold text-[var(--on-surface)] outline-none ring-1 ring-transparent transition focus:ring-[var(--primary)]"
                >
                  <option value="AVAILABLE">Trống (Sẵn sàng)</option>
                  <option value="PROCESSING">Chờ dọn</option>
                  <option value="MAINTENANCE">Bảo trì</option>
                  <option value="BLOCKED">Đã khóa</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeRoomForm}
                className="min-h-11 rounded-xl border border-[var(--outline-variant)] px-5 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--surface-container-low)]"
              >
                Hủy
              </button>
              <button
                disabled={isSaving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-[var(--on-primary)] transition hover:bg-[color:rgba(0,0,60,0.88)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <VsIcon name={roomForm.id ? "edit" : "add_circle"} />
                {isSaving
                  ? "Đang lưu..."
                  : roomForm.id
                    ? "Lưu cập nhật"
                    : "Tạo phòng"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedQrRoom ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Đóng mã QR"
            onClick={() => setSelectedQrRoom(null)}
            className="absolute inset-0 bg-[color:rgba(26,28,28,0.48)] backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-[700px] rounded-2xl border border-[color:rgba(198,197,213,0.62)] bg-white p-6 text-center shadow-[0_28px_80px_rgba(0,0,60,0.22)]"
          >
            <button
              type="button"
              onClick={() => setSelectedQrRoom(null)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]"
              title="Đóng"
            >
              <VsIcon name="close" />
            </button>
            <div className="mx-auto flex w-full max-w-[650px] flex-col items-center border border-[var(--outline-variant)] bg-white px-6 pb-9 pt-10 sm:px-10">
              <h2 className="text-4xl font-bold text-[var(--primary)]">
                Phòng #{getRoomNumber(selectedQrRoom)}
              </h2>
              {getGuestQrUrl(selectedQrRoom, clientOrigin) ? (
                <>
                  <div className="mt-8 flex aspect-square w-full max-w-[360px] items-center justify-center">
                    <QRCodeSVG
                      ref={qrCodeRef}
                      value={getGuestQrUrl(selectedQrRoom, clientOrigin) ?? ""}
                      size={360}
                      fgColor="#00003c"
                      bgColor="#ffffff"
                      level="M"
                      className="h-full w-full"
                    />
                  </div>
                  <p className="mt-5 block max-w-full select-text break-all rounded-xl bg-[var(--surface-container-low)] px-4 py-3 text-sm font-semibold text-[var(--primary)]">
                    {getGuestQrUrl(selectedQrRoom, clientOrigin)}
                  </p>
                </>
              ) : (
                <div className="mt-8 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-5 py-6 text-sm font-semibold text-[var(--on-surface-variant)]">
                  Chưa có mã QR public cho phòng này. Vui lòng kích hoạt hoặc
                  đổi mã QR trước.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={downloadSelectedQrRoom}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-[var(--on-primary)] shadow-lg shadow-[color:rgba(0,0,60,0.12)] transition hover:-translate-y-0.5 hover:bg-[color:rgba(0,0,60,0.88)] hover:shadow-xl"
            >
              <VsIcon name="download" className="text-lg" />
              Tải xuống
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
