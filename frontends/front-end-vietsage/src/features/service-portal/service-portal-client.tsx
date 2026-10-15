"use client";

import { type FormEvent, useState } from "react";
import { LocationFields, type LocationValue } from "@/features/marketplace/components/location-fields";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useServicePortal } from "./use-service-portal";
import type { MarketplaceOrder, ServicePortalData } from "./types";

function locationFrom(data: ServicePortalData): LocationValue {
  const item = data.profile;
  return {
    googleMapsUrl: item.googleMapsUrl ?? "",
    latitude: item.latitude == null ? "" : String(item.latitude),
    longitude: item.longitude == null ? "" : String(item.longitude),
    locationAccuracyMeters: item.locationAccuracyMeters == null ? "" : String(item.locationAccuracyMeters),
    locationSource: item.locationSource ?? undefined,
  };
}

function nextStatus(order: MarketplaceOrder): string | null {
  if (order.status === "PENDING") return "ACKNOWLEDGED";
  if (order.status === "ACKNOWLEDGED") return "COMPLETED";
  return null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Chờ tiếp nhận";
    case "ACKNOWLEDGED":
      return "Đã tiếp nhận";
    case "COMPLETED":
      return "Hoàn thành";
    case "CANCELLED":
      return "Đã huỷ";
    default:
      return status;
  }
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-800 focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700";

function Loaded({ value }: { value: ServicePortalData }) {
  const { profile, create, transition } = useServicePortal();
  const [location, setLocation] = useState(() => locationFrom(value));

  const saveLocation = async () => {
    const confirmResult = await showConfirmDialog({
      title: "Xác nhận cập nhật vị trí?",
      text: "Lưu thông tin vị trí và tọa độ phục vụ cho đối tác dịch vụ này?",
      confirmText: "Lưu vị trí",
      cancelText: "Hủy",
      reverseButtons: false,
    });
    if (!confirmResult.isConfirmed) return;

    try {
      await profile.mutateAsync({
        googleMapsUrl: location.googleMapsUrl || null,
        latitude: location.latitude ? Number(location.latitude) : null,
        longitude: location.longitude ? Number(location.longitude) : null,
        locationAccuracyMeters: location.locationAccuracyMeters ? Number(location.locationAccuracyMeters) : null,
        locationSource: location.locationSource ?? null,
      });
      await showSuccessAlert("Cập nhật thành công", "Đã lưu thông tin vị trí đối tác.");
    } catch (err) {
      await showErrorAlert("Lưu vị trí thất bại", err);
    }
  };

  const createService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const serviceName = String(form.get("name") || "").trim();
    if (!serviceName) return;

    const confirmResult = await showConfirmDialog({
      title: "Xác nhận tạo dịch vụ?",
      text: `Thêm dịch vụ "${serviceName}" vào danh mục đối tác?`,
      confirmText: "Tạo dịch vụ",
      cancelText: "Hủy",
      reverseButtons: false,
    });
    if (!confirmResult.isConfirmed) return;

    try {
      await create.mutateAsync({
        name: serviceName,
        unitPrice: Number(form.get("unitPrice")),
        imageUrls: [],
        mode: String(form.get("mode")),
        capacityAvailable: form.get("capacity") ? Number(form.get("capacity")) : null,
        waitingMinutes: Number(form.get("waitingMinutes")),
        status: "ACTIVE",
      });
      await showSuccessAlert("Tạo dịch vụ thành công", `Đã thêm dịch vụ "${serviceName}".`);
      (event.target as HTMLFormElement)?.reset();
    } catch (err) {
      await showErrorAlert("Tạo dịch vụ thất bại", err);
    }
  };

  const handleTransition = async (orderId: string, orderNumber: string, toStatus: string) => {
    const nextLabel = statusLabel(toStatus);
    const confirmResult = await showConfirmDialog({
      title: "Chuyển trạng thái đơn hàng?",
      text: `Xác nhận chuyển trạng thái đơn hàng #${orderNumber} sang "${nextLabel}"?`,
      confirmText: "Xác nhận",
      cancelText: "Hủy",
      reverseButtons: false,
    });
    if (!confirmResult.isConfirmed) return;

    try {
      await transition.mutateAsync({ orderId, toStatus });
      await showSuccessAlert("Thành công", `Đã cập nhật trạng thái đơn #${orderNumber} sang "${nextLabel}".`);
    } catch (err) {
      await showErrorAlert("Cập nhật thất bại", err);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 min-w-0">
      <header>
        <p className="font-semibold text-xs tracking-wider uppercase text-emerald-700">
          Đối tác dịch vụ liên kết
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
          {value.profile.displayName}
        </h1>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-xs border border-neutral-100 min-w-0">
        <LocationFields value={location} onChange={setLocation} />
        <button
          type="button"
          onClick={saveLocation}
          disabled={profile.isPending}
          className="mt-4 min-h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
        >
          {profile.isPending ? "Đang lưu..." : "Lưu vị trí"}
        </button>
      </section>

      {/* Grid: 1 col on mobile, 2 cols on tablet, 320px + 1fr on desktop with min-w-0 to prevent horizontal overflow */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[320px_1fr] gap-5 min-w-0">
        <form onSubmit={createService} className="space-y-3.5 rounded-2xl border border-neutral-200 bg-white p-5 min-w-0 shadow-xs">
          <h2 className="text-lg font-bold text-neutral-900">Thêm dịch vụ mới</h2>
          <p className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
            Danh mục: {value.profile.category?.nameVi ?? "Chưa được gán"}
          </p>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Tên dịch vụ *</label>
            <input required name="name" placeholder="Ví dụ: Giặt là tiêu chuẩn" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Đơn giá (VND) *</label>
            <input required min={0} type="number" name="unitPrice" placeholder="Ví dụ: 50000" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Sức chứa tối đa (trống = không giới hạn)</label>
            <input min={0} type="number" name="capacity" placeholder="Không bắt buộc" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Thời gian chờ dự kiến (phút) *</label>
            <input required min={0} type="number" name="waitingMinutes" placeholder="Ví dụ: 30" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Hình thức phục vụ *</label>
            <select name="mode" className={inputClass}>
              <option value="CUSTOMER_AT_SERVICE">Khách sử dụng tại địa điểm</option>
              <option value="DELIVERY_TO_HOTEL">Giao dịch vụ tới khách sạn</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="w-full min-h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            {create.isPending ? "Đang tạo..." : "Tạo dịch vụ"}
          </button>
        </form>

        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutral-900">Danh mục dịch vụ ({value.services.length})</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
            {value.services.length === 0 ? (
              <p className="col-span-full rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
                Chưa có dịch vụ nào. Hãy tạo dịch vụ đầu tiên ở biểu mẫu bên cạnh.
              </p>
            ) : (
              value.services.map((item) => (
                <article key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs min-w-0">
                  <h3 className="font-bold text-neutral-900 truncate">{item.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-emerald-800">
                    {Number(item.unitPrice).toLocaleString("vi-VN")} ₫
                    <span className="text-neutral-500 font-normal"> · Chờ {item.waitingMinutes} phút</span>
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Sức chứa: {item.capacityAvailable ?? "Không giới hạn"} ·{" "}
                    <span className="font-medium text-emerald-700">
                      {item.status === "ACTIVE" ? "Đang hoạt động" : item.status}
                    </span>
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-bold text-neutral-900">Đơn hàng đối tác ({value.orders.length})</h2>
        <div className="mt-3 space-y-3 min-w-0">
          {value.orders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
              Hiện chưa có đơn hàng nào từ khách.
            </p>
          ) : (
            value.orders.map((order) => {
              const next = nextStatus(order);
              return (
                <article key={order.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <b className="text-sm font-bold text-neutral-900">#{order.orderNumber}</b>
                      <p className="text-sm text-neutral-700">
                        {order.serviceNameSnapshot} ·{" "}
                        <span className="font-semibold text-emerald-700">
                          {statusLabel(order.status)}
                        </span>
                      </p>
                    </div>
                    {next ? (
                      <button
                        type="button"
                        className="min-h-10 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 text-xs font-semibold text-white transition-colors cursor-pointer"
                        onClick={() => handleTransition(order.id, order.orderNumber, next)}
                      >
                        Chuyển sang &quot;{statusLabel(next)}&quot;
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      {profile.isError || create.isError || transition.isError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-200">
          Không thể lưu thay đổi. Vui lòng kiểm tra lại kết nối.
        </p>
      ) : null}
    </main>
  );
}

export function ServicePortalClient() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8 text-neutral-600 text-sm">Đang tải dữ liệu cổng dịch vụ…</div>;
  if (data.isError || !data.data) {
    return (
      <div role="alert" className="p-8 text-rose-700 text-sm font-medium">
        Không thể tải thông tin cổng dịch vụ đối tác.
      </div>
    );
  }
  return <Loaded key={data.data.profile.locationVerifiedAt ?? "unverified"} value={data.data} />;
}
