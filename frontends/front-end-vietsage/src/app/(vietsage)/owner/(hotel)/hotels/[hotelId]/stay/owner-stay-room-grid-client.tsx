"use client";

import { type FormEvent, startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelCheckInResult,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

import { VsIcon } from "../../../../../_components/vs-icon";

type Props = {
  hotelId: string;
  rooms: HotelRoomSummary[];
  apiBasePath?: string;
};

type RoomStatusFilter =
  | "all"
  | "available"
  | "occupied"
  | "processing"
  | "unavailable";

type CheckInForm = {
  guestDisplayName: string;
  guestPhone: string;
  plannedCheckOutAt: string;
};

type FormErrors = Partial<Record<keyof CheckInForm, string>>;

type RoomAvailability = "available" | "occupied" | "processing" | "unavailable";

const pageSize = 30;

const statusFilters: { value: RoomStatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Trống" },
  { value: "occupied", label: "Đang ở" },
  { value: "processing", label: "Đang xử lý" },
  { value: "unavailable", label: "Không khả dụng" },
];

const checkInFormSchema = z.object({
  guestDisplayName: z.string().trim().min(1, "Nhập tên khách."),
  guestPhone: z
    .string()
    .trim()
    .regex(/^$|^[0-9+()\s.-]{8,20}$/, "Số điện thoại không hợp lệ."),
  plannedCheckOutAt: z
    .string()
    .refine(
      (value) => Boolean(toIsoFromLocal(value)),
      "Chọn thời gian check-out hợp lệ.",
    ),
});

function getRoomNumber(room: HotelRoomSummary): string {
  return room.roomNumber?.trim() || room.id;
}

function getRoomType(room: HotelRoomSummary): string {
  return room.type?.trim() || "";
}

function getRoomStatus(room: HotelRoomSummary): string {
  return room.status?.trim().toUpperCase() || "AVAILABLE";
}

function roomHasActiveStay(room: HotelRoomSummary): boolean {
  return room.activeStay?.status?.toUpperCase() === "ACTIVE";
}

function getRoomAvailability(room: HotelRoomSummary): RoomAvailability {
  const status = getRoomStatus(room);

  if (roomHasActiveStay(room)) return "occupied";
  if (["CLEANING", "PROCESSING", "PENDING", "MAINTENANCE"].includes(status))
    return "processing";
  if (
    [
      "DISABLED",
      "INACTIVE",
      "OUT_OF_SERVICE",
      "UNAVAILABLE",
      "BLOCKED",
    ].includes(status)
  )
    return "unavailable";

  return "available";
}

function roomStatusLabel(room: HotelRoomSummary): string {
  const availability = getRoomAvailability(room);
  if (availability === "occupied") return "Đang ở";
  if (availability === "processing") return "Đang xử lý";
  if (availability === "unavailable") return "Không khả dụng";
  return "Trống";
}

function roomTileClass(room: HotelRoomSummary): string {
  const availability = getRoomAvailability(room);
  if (availability === "occupied")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (availability === "processing")
    return "border-gray-200 bg-gray-50 text-gray-500 opacity-70";
  if (availability === "unavailable")
    return "border-red-100 bg-red-50 text-red-600 opacity-70";
  return "border-green-200 bg-green-50 text-green-700 hover:-translate-y-0.5 hover:shadow-md";
}

function isCheckInAllowed(room: HotelRoomSummary): boolean {
  return getRoomAvailability(room) === "available";
}

function roomSearchText(room: HotelRoomSummary): string {
  return [room.id, room.roomNumber, room.type, room.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function defaultCheckOutValue(): string {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(12, 0, 0, 0);

  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

function emptyForm(): CheckInForm {
  return {
    guestDisplayName: "",
    guestPhone: "",
    plannedCheckOutAt: defaultCheckOutValue(),
  };
}

function toIsoFromLocal(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function validateForm(form: CheckInForm): FormErrors {
  const result = checkInFormSchema.safeParse(form);
  if (result.success) return {};

  const fieldErrors = result.error.flatten().fieldErrors;
  return {
    guestDisplayName: fieldErrors.guestDisplayName?.[0],
    guestPhone: fieldErrors.guestPhone?.[0],
    plannedCheckOutAt: fieldErrors.plannedCheckOutAt?.[0],
  };
}

function isTechnicalMessage(message: string): boolean {
  return /PRISMA_|Prisma|Record to update not found|Foreign key constraint|Unique constraint/i.test(
    message,
  );
}

function getNestedMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;

  const record = value as Record<string, unknown>;
  const candidates = [record.detail, record.message, record.errorMessage];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      !isTechnicalMessage(candidate)
    ) {
      return candidate.trim();
    }
  }

  return getNestedMessage(record.data) ?? getNestedMessage(record.error);
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

export function OwnerStayRoomGridClient({
  hotelId,
  rooms,
  apiBasePath = `/api/owner/hotels/${encodeURIComponent(hotelId)}`,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoomStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(
    null,
  );
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [form, setForm] = useState<CheckInForm>(() => emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const filteredRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rooms.filter((room) => {
      const availability = getRoomAvailability(room);
      const matchesStatus =
        statusFilter === "all" || availability === statusFilter;
      const matchesQuery =
        !normalizedQuery || roomSearchText(room).includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, rooms, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRooms = filteredRooms.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value: RoomStatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function openCheckIn(room: HotelRoomSummary) {
    if (!isCheckInAllowed(room)) return;

    setSelectedRoom(room);
    setForm(emptyForm());
    setErrors({});
    setIsCheckInOpen(true);
  }

  async function handleTileClick(room: HotelRoomSummary) {
    const availability = getRoomAvailability(room);
    if (availability === "available") {
      openCheckIn(room);
      return;
    }
    if (availability === "processing") {
      const confirm = await Swal.fire({
        icon: "question",
        title: `Hoàn tất dọn phòng ${getRoomNumber(room)}?`,
        text: "Trạng thái phòng sẽ chuyển sang TRỐNG (Sẵn sàng đón khách mới).",
        showCancelButton: true,
        confirmButtonText: "Đã dọn xong ? -> Chuyển TRỐNG",
        cancelButtonText: "Đóng",
        confirmButtonColor: "#17201b",
      });
      if (!confirm.isConfirmed) return;

      try {
        await requestInternalApiEnvelope(
          `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}`,
          {
            method: "PATCH",
            body: { status: "AVAILABLE" },
          },
        );
        await Swal.fire({
          icon: "success",
          title: `Phòng ${getRoomNumber(room)} đã sẵn sàng!`,
          text: "Trạng thái phòng đã được cập nhật thành TRỐNG.",
          confirmButtonColor: "#17201b",
        });
        startTransition(() => {
          router.refresh();
        });
      } catch (err) {
        await Swal.fire({
          icon: "error",
          title: "Không thể cập nhật trạng thái phòng",
          text: err instanceof Error ? err.message : "Vui lòng thử lại.",
          confirmButtonColor: "#17201b",
        });
      }
    }
  }

  function closeCheckIn() {
    if (isSaving) return;
    setIsCheckInOpen(false);
    setSelectedRoom(null);
    setErrors({});
  }

  function updateField<Key extends keyof CheckInForm>(
    field: Key,
    value: CheckInForm[Key],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom || !isCheckInAllowed(selectedRoom)) return;

    const validationErrors = validateForm(form);
    if (Object.values(validationErrors).some(Boolean)) {
      setErrors(validationErrors);
      return;
    }

    const plannedCheckOutAt = toIsoFromLocal(form.plannedCheckOutAt);
    if (!plannedCheckOutAt) return;

    const confirmed = await Swal.fire({
      icon: "question",
      title: "Xác nhận check-in",
      text: `Bạn muốn check-in khách ${form.guestDisplayName.trim()} vào phòng ${getRoomNumber(selectedRoom)}?`,
      showCancelButton: true,
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Hủy",
    });

    if (!confirmed.isConfirmed) return;

    setIsSaving(true);
    try {
      const result = await requestInternalApiEnvelope<HotelCheckInResult>(
        `${apiBasePath}/stays`,
        {
          method: "POST",
          body: {
            roomId: selectedRoom.id,
            guestDisplayName: form.guestDisplayName.trim(),
            ...(form.guestPhone.trim()
              ? { guestPhone: form.guestPhone.trim() }
              : {}),
            plannedCheckInAt: new Date().toISOString(),
            plannedCheckOutAt,
          },
        },
      );

      setIsCheckInOpen(false);
      setSelectedRoom(null);
      await Swal.fire({
        icon: "success",
        title: "Đã mở phòng cho khách",
        text: `Mã truy cập GuestOS: ${result.data.accessCode}. QR phòng đã được kích hoạt để khách quét và gọi dịch vụ.`,
        confirmButtonText: "Hoàn tất",
        confirmButtonColor: "#00003c",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể check-in",
        text: getBusinessErrorMessage(error, "Vui lòng thử lại."),
        confirmButtonColor: "#00003c",
      });
    } finally {
      startTransition(() => {
        router.refresh();
      });
      setIsSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">
            Sơ đồ phòng trực quan
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--primary)]">
            Tình trạng phòng theo khách sạn
          </h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-[var(--on-surface-variant)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Trống
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Đang ở
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Đang xử lý
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            Không khả dụng
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Tìm phòng</span>
          <VsIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--on-surface-variant)]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Tìm theo số phòng hoặc loại phòng..."
            className="h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-fixed)]"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => updateStatusFilter(filter.value)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-[var(--primary-fixed)] text-[var(--primary)]"
                  : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-8 xl:grid-cols-10">
        {paginatedRooms.map((room) => {
          const allowed = isCheckInAllowed(room);
          const availability = getRoomAvailability(room);
          const isInteractive = allowed || availability === "processing";

          return (
            <button
              key={room.id}
              type="button"
              onClick={() => void handleTileClick(room)}
              disabled={!isInteractive}
              title={
                availability === "processing"
                  ? `Phòng ${getRoomNumber(room)} - Chờ dọn dẹp (Nhấn để hoàn tất dọn phòng)`
                  : allowed
                    ? `Check-in phòng ${getRoomNumber(room)}`
                    : `${getRoomNumber(room)} - ${roomStatusLabel(room)}`
              }
              className={`aspect-square rounded-lg border p-2 text-center shadow-sm transition disabled:cursor-not-allowed ${roomTileClass(room)}`}
            >
              <span className="block truncate text-sm font-bold">
                {getRoomNumber(room)}
              </span>
              <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.08em] opacity-75">
                {roomStatusLabel(room)}
              </span>
            </button>
          );
        })}
        {filteredRooms.length === 0 ? (
          <p className="col-span-full rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-center text-sm text-[var(--on-surface-variant)]">
            Chưa có phòng phù hợp với bộ lọc hiện tại.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-[var(--outline-variant)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--on-surface-variant)]">
          Hiển thị {paginatedRooms.length} trên {filteredRooms.length} phòng
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={safePage === 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-40"
          >
            <VsIcon name="chevron_left" className="text-[18px]" />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1)
            .slice(Math.max(0, safePage - 3), Math.max(3, safePage + 2))
            .map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold ${pageNumber === safePage ? "bg-[var(--primary)] text-white" : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"}`}
              >
                {pageNumber}
              </button>
            ))}
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(current + 1, totalPages))
            }
            disabled={safePage === totalPages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-40"
          >
            <VsIcon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      {isCheckInOpen && selectedRoom ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Đóng hộp thoại check-in"
            onClick={closeCheckIn}
            className="absolute inset-0 bg-[color:rgba(26,28,28,0.48)] backdrop-blur-sm"
          />
          <form
            noValidate
            onSubmit={submitCheckIn}
            role="dialog"
            aria-modal="true"
            aria-labelledby="check-in-title"
            className="relative z-10 w-full max-w-3xl rounded-2xl border border-[color:rgba(198,197,213,0.62)] bg-white p-6 shadow-[0_28px_80px_rgba(0,0,60,0.22)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
                  Check-in
                </p>
                <h2
                  id="check-in-title"
                  className="mt-2 text-2xl font-semibold text-[var(--primary)]"
                >
                  Check-in khách lưu trú
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--on-surface-variant)]">
                  Nhập thông tin khách để hoàn tất check-in cho phòng đã chọn.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCheckIn}
                disabled={isSaving}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-fixed)] disabled:opacity-50"
                title="Đóng"
              >
                <VsIcon name="close" />
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                Phòng đã chọn
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-2xl font-semibold text-[var(--primary)]">
                    Phòng {getRoomNumber(selectedRoom)}
                  </p>
                  {getRoomType(selectedRoom) ? (
                    <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                      {getRoomType(selectedRoom)}
                    </p>
                  ) : null}
                </div>
                <span className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                  {roomStatusLabel(selectedRoom)}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Tên khách
                </span>
                <input
                  value={form.guestDisplayName}
                  onChange={(event) =>
                    updateField("guestDisplayName", event.target.value)
                  }
                  aria-invalid={Boolean(errors.guestDisplayName)}
                  className="min-h-12 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-fixed)]"
                  placeholder="Nguyễn Văn A"
                />
                {errors.guestDisplayName ? (
                  <span className="text-xs font-semibold text-[var(--error)]">
                    {errors.guestDisplayName}
                  </span>
                ) : null}
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Số điện thoại
                </span>
                <input
                  value={form.guestPhone}
                  onChange={(event) =>
                    updateField("guestPhone", event.target.value)
                  }
                  aria-invalid={Boolean(errors.guestPhone)}
                  className="min-h-12 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-fixed)]"
                  placeholder="0901 234 567"
                />
                {errors.guestPhone ? (
                  <span className="text-xs font-semibold text-[var(--error)]">
                    {errors.guestPhone}
                  </span>
                ) : null}
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                  Dự kiến check-out
                </span>
                <input
                  type="datetime-local"
                  value={form.plannedCheckOutAt}
                  onChange={(event) =>
                    updateField("plannedCheckOutAt", event.target.value)
                  }
                  aria-invalid={Boolean(errors.plannedCheckOutAt)}
                  className="min-h-12 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-fixed)]"
                />
                {errors.plannedCheckOutAt ? (
                  <span className="text-xs font-semibold text-[var(--error)]">
                    {errors.plannedCheckOutAt}
                  </span>
                ) : null}
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCheckIn}
                disabled={isSaving}
                className="min-h-11 rounded-xl border border-[var(--outline-variant)] px-5 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                disabled={isSaving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-[var(--on-primary)] transition hover:bg-[color:rgba(0,0,60,0.88)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <VsIcon name={isSaving ? "sync" : "task_alt"} />
                {isSaving ? "Đang đồng bộ..." : "Đồng bộ check-in"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
