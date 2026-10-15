"use client";

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { ownerRoomTypesResource } from "@/features/hotel-ops/resources/owner-room-types-resource";
import type { HotelRoomType } from "@/features/hotel-ops/types/hotel-ops-contract";

type RoomTypesCatalogModalProps = {
  hotelId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

function formatVndDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) {
    return "Chưa thiết lập";
  }
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) + " ₫";
}

function toRawDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPriceInput(value: string): string {
  const digits = toRawDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(digits));
}

export function RoomTypesCatalogModal({
  hotelId,
  isOpen,
  onClose,
  onUpdated,
}: RoomTypesCatalogModalProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const roomTypesScope = useMemo(() => ownerRoomTypesResource.bind({ hotelId }), [hotelId]);

  const {
    data: roomTypeData,
    isLoading,
    isError,
    refetch,
  } = useQuery(roomTypesScope.queries.list.options(undefined));

  const updatePriceMutation = useMutation(roomTypesScope.mutations.updatePrice.options());
  const createTypeMutation = useMutation(roomTypesScope.mutations.create.options());

  // Local state for inline price editing per room type
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // New room type state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePrice, setNewTypePrice] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const items: HotelRoomType[] = useMemo(() => roomTypeData?.items ?? [], [roomTypeData]);

  const stats = useMemo(() => {
    const total = items.length;
    const ready = items.filter((i) => i.readiness === "READY" && (i.basePrice ?? 0) > 0).length;
    const missing = total - ready;
    return { total, ready, missing };
  }, [items]);

  if (!isOpen) return null;

  const handlePriceChange = (id: string, value: string) => {
    const raw = toRawDigits(value);
    setEditingPrices((prev) => ({ ...prev, [id]: raw }));
  };

  const handleSavePrice = async (item: HotelRoomType) => {
    const inputValue = editingPrices[item.id] !== undefined
      ? editingPrices[item.id]
      : (item.basePrice ? String(item.basePrice) : "");

    const numericPrice = Number(inputValue);
    if (!numericPrice || numericPrice <= 0) {
      await showErrorAlert(
        "Giá gốc không hợp lệ",
        "Vui lòng nhập giá gốc lớn hơn 0 (VNĐ) để kích hoạt đồng bộ ARI và kết nối OTA.",
      );
      return;
    }

    try {
      setSavingId(item.id);

      if (item.id.startsWith("legacy:")) {
        await createTypeMutation.mutateAsync({
          name: item.name,
          basePrice: numericPrice,
        });
      } else {
        await updatePriceMutation.mutateAsync({
          roomTypeId: item.id,
          basePrice: numericPrice,
        });
      }

      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-room-types", "hotel", hotelId] });
      await queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-rooms", "hotel", hotelId] });

      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      onUpdated?.();

      await showSuccessAlert(
        "Cập nhật giá gốc thành công",
        `Hạng phòng "${item.name}" đã được cập nhật giá gốc ${formatVndDisplay(numericPrice)} và sẵn sàng đồng bộ sang kênh bán phòng.`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Vui lòng thử lại sau.";
      await showErrorAlert("Không thể lưu giá gốc", msg);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateNewType = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newTypeName.trim();
    if (!trimmedName) {
      await showErrorAlert("Thiếu thông tin", "Vui lòng nhập tên loại phòng mới.");
      return;
    }
    const numericPrice = Number(toRawDigits(newTypePrice));
    if (!numericPrice || numericPrice <= 0) {
      await showErrorAlert("Giá gốc không hợp lệ", "Vui lòng nhập giá gốc lớn hơn 0 (VNĐ).");
      return;
    }

    try {
      setIsCreatingNew(true);
      await createTypeMutation.mutateAsync({
        name: trimmedName,
        basePrice: numericPrice,
      });

      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-room-types", "hotel", hotelId] });
      await queryClient.invalidateQueries({ queryKey: ["vietsage", "owner-rooms", "hotel", hotelId] });

      setNewTypeName("");
      setNewTypePrice("");
      setShowAddForm(false);
      onUpdated?.();

      await showSuccessAlert(
        "Tạo loại phòng thành công",
        `Hạng phòng "${trimmedName}" đã được thiết lập với giá gốc ${formatVndDisplay(numericPrice)}.`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Vui lòng kiểm tra lại.";
      await showErrorAlert("Không thể tạo loại phòng", msg);
    } finally {
      setIsCreatingNew(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl border border-[var(--outline-variant)] bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--outline-variant)] px-6 py-5 sm:px-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
                <VsIcon name="tune" className="text-xl" />
              </span>
              <h2 id={titleId} className="text-2xl font-bold tracking-tight text-[var(--primary)]">
                Danh mục loại phòng & Giá gốc ARI
              </h2>
            </div>
            <p className="mt-1.5 text-sm text-[var(--on-surface-variant)] leading-relaxed max-w-2xl">
              Cấu hình giá gốc tiêu chuẩn cho từng hạng phòng. Khi đồng bộ Channex hoặc các kênh OTA, giá gốc là điều kiện bắt buộc để đẩy quỹ phòng (ARI) thành công.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Đóng cửa sổ"
          >
            <VsIcon name="close" className="text-2xl" />
          </button>
        </div>

        {/* Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--surface-container-low)] px-6 py-4 sm:px-8 border-b border-[var(--outline-variant)]">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 border border-slate-200/80 shadow-xs">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <VsIcon name="meeting_room" className="text-xl" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng hạng phòng</p>
              <p className="text-xl font-bold text-slate-900">{stats.total}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 border border-slate-200/80 shadow-xs">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <VsIcon name="check_circle" className="text-xl" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sẵn sàng đẩy OTA</p>
              <p className="text-xl font-bold text-emerald-700">{stats.ready}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 border border-slate-200/80 shadow-xs">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <VsIcon name="warning" className="text-xl" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chưa có giá gốc</p>
              <p className="text-xl font-bold text-amber-700">{stats.missing}</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
              <span className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--primary)] border-t-transparent" />
              <p className="text-sm font-medium">Đang tải danh mục loại phòng...</p>
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
              <VsIcon name="error" className="mx-auto text-3xl text-red-600 mb-2" />
              <p className="font-semibold">Không thể tải danh mục loại phòng</p>
              <p className="mt-1 text-sm text-red-600">Vui lòng kiểm tra kết nối mạng và thử lại.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 transition"
              >
                <VsIcon name="refresh" className="text-base" />
                Thử lại
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              <VsIcon name="hotel" className="mx-auto text-4xl text-slate-400 mb-2" />
              <p className="font-semibold text-slate-700">Chưa có loại phòng nào</p>
              <p className="mt-1 text-sm text-slate-500">Hãy tạo loại phòng mới hoặc cấu hình phòng trong khách sạn.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Hạng phòng</th>
                    <th scope="col" className="px-4 py-3.5 text-center">Số phòng</th>
                    <th scope="col" className="px-4 py-3.5">Trạng thái ARI</th>
                    <th scope="col" className="px-5 py-3.5">Giá gốc niêm yết</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Cập nhật giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const isLegacy = item.id.startsWith("legacy:");
                    const isReady = item.readiness === "READY" && (item.basePrice ?? 0) > 0;
                    const isBusy = savingId === item.id;
                    const rawInput = editingPrices[item.id] !== undefined
                      ? editingPrices[item.id]
                      : (item.basePrice ? String(item.basePrice) : "");

                    return (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          {isLegacy ? (
                            <span className="inline-block mt-0.5 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                              Từ danh sách phòng hiện hữu
                            </span>
                          ) : (
                            <span className="inline-block mt-0.5 text-[11px] text-slate-400">
                              Đã lưu trong danh mục
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {item.roomCount} phòng
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {isReady ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                              Sẵn sàng đẩy OTA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                              Chưa có giá gốc
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-800">
                          {formatVndDisplay(item.basePrice)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="relative w-36">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="VNĐ"
                                value={formatPriceInput(rawInput)}
                                onChange={(e) => handlePriceChange(item.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSavePrice(item);
                                  }
                                }}
                                disabled={isBusy}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-right text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 disabled:opacity-50"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleSavePrice(item)}
                              disabled={isBusy || !rawInput || Number(rawInput) <= 0}
                              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-[color:rgba(0,0,60,0.88)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                              title="Lưu giá gốc"
                            >
                              {isBusy ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              ) : (
                                <>
                                  <VsIcon name="save" className="text-sm" />
                                  <span>Lưu</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add New Room Type Accordion / Form */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 text-sm font-bold text-[var(--primary)] hover:text-amber-800 transition"
              >
                <VsIcon name="add_circle" className="text-lg" />
                <span>Thêm loại phòng mới vào danh mục</span>
              </button>
            ) : (
              <form onSubmit={handleCreateNewType} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">Thêm loại phòng mới</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Đóng
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tên loại phòng</span>
                    <input
                      type="text"
                      placeholder="VD: Phòng Superior Giường Đôi"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Giá gốc tiêu chuẩn (VNĐ)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="VD: 1.000.000"
                      value={formatPriceInput(newTypePrice)}
                      onChange={(e) => setNewTypePrice(toRawDigits(e.target.value))}
                      required
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10"
                    />
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingNew || !newTypeName.trim() || !newTypePrice}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[color:rgba(0,0,60,0.88)] transition disabled:opacity-50"
                  >
                    {isCreatingNew ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Đang tạo...</span>
                      </>
                    ) : (
                      <>
                        <VsIcon name="add" className="text-base" />
                        <span>Tạo loại phòng</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--outline-variant)] bg-slate-50/80 px-6 py-4 sm:px-8">
          <p className="text-xs text-[var(--on-surface-variant)]">
            * Sau khi lưu giá gốc, bạn có thể vào mục Quản lý kênh phân phối để đẩy ARI sang Channex.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-200 px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-300 active:scale-[0.98]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
