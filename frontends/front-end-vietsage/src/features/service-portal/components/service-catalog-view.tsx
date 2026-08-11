"use client";

import { type FormEvent } from "react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { useServicePortal } from "../use-service-portal";
import type { ServicePortalData } from "../types";

const inputClass =
  "h-11 w-full rounded-xl border border-[#dcd3c1] bg-[#f9f6f0] px-3.5 text-sm font-semibold text-[#17201b] placeholder:text-[#8a958e] focus:bg-white focus:border-[#8c6d29] focus:outline-none focus:ring-4 focus:ring-[#8c6d29]/10 transition-all";

const labelClass = "block text-xs font-semibold text-[#46534b] mb-1.5";

export function ServiceCatalogView({ data }: Readonly<{ data: ServicePortalData }>) {
  const { create } = useServicePortal();

  const createService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const serviceName = String(form.get("name"));

    const confirmRes = await Swal.fire({
      icon: "question",
      title: "Tạo dịch vụ mới?",
      text: `Bạn có chắc chắn muốn thêm dịch vụ "${serviceName}" vào danh mục cung cấp không?`,
      showCancelButton: true,
      confirmButtonText: "Xác nhận tạo",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#17201b",
      cancelButtonColor: "#65726a",
    });

    if (!confirmRes.isConfirmed) return;

    create.mutate(
      {
        categoryId: String(form.get("categoryId")),
        name: serviceName,
        unitPrice: Number(form.get("unitPrice")),
        imageUrls: [],
        mode: String(form.get("mode")),
        capacityAvailable: form.get("capacity") ? Number(form.get("capacity")) : null,
        waitingMinutes: Number(form.get("waitingMinutes")),
        status: "ACTIVE",
      },
      {
        onSuccess: () => {
          toast.success("Tạo dịch vụ mới thành công!");
          formElement.reset();
        },
        onError: () => {
          toast.error("Không thể tạo dịch vụ mới. Vui lòng kiểm tra lại.");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-1.5 border-b border-[#e5ddcd] pb-4">
        <h1 className="text-2xl font-extrabold text-[#17201b] sm:text-3xl">Danh Mục Dịch Vụ Cung Cấp</h1>
        <p className="text-sm font-medium text-[#5a6760]">
          Tạo mới và quản lý các sản phẩm / dịch vụ hiển thị tới khách hàng lưu trú tại các khách sạn đối tác.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Form: Add New Service */}
        <form onSubmit={createService} className="space-y-5 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-6 shadow-xs h-fit">
          <div className="border-b border-[#eee7d8] pb-3.5">
            <h2 className="text-lg font-extrabold text-[#17201b] flex items-center gap-2">
              <span className="text-xl">+</span> Thêm dịch vụ mới
            </h2>
            <p className="text-xs text-[#65726a]">Nhập thông tin chi tiết dịch vụ muốn khởi tạo</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="cat-id" className={labelClass}>
                Danh mục dịch vụ
              </label>
              <select id="cat-id" required name="categoryId" className={inputClass}>
                <option value="">-- Chọn danh mục --</option>
                {data.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nameVi} ({item.nameEn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="service-name" className={labelClass}>
                Tên dịch vụ
              </label>
              <input
                id="service-name"
                required
                name="name"
                placeholder="Ví dụ: Massage body thảo dược (60p)"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="service-price" className={labelClass}>
                Giá dịch vụ (VND)
              </label>
              <input
                id="service-price"
                required
                min={0}
                type="number"
                name="unitPrice"
                placeholder="Ví dụ: 350000"
                className={inputClass}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label htmlFor="service-waiting" className={labelClass}>
                  Thời gian chuẩn bị (Phút)
                </label>
                <input
                  id="service-waiting"
                  required
                  min={0}
                  type="number"
                  name="waitingMinutes"
                  placeholder="Ví dụ: 15"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="service-capacity" className={labelClass}>
                  Sức chứa / Lượt phục vụ
                </label>
                <input
                  id="service-capacity"
                  min={0}
                  type="number"
                  name="capacity"
                  placeholder="Trống = Không giới hạn"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="service-mode" className={labelClass}>
                Hình thức phục vụ
              </label>
              <select id="service-mode" name="mode" className={inputClass}>
                <option value="CUSTOMER_AT_SERVICE">Khách đến địa điểm dịch vụ</option>
                <option value="DELIVERY_TO_HOTEL">Giao tận nơi đến khách sạn</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={create.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17201b] px-5 text-sm font-bold text-[#f8f1e6] transition-colors hover:bg-[#27352d] disabled:opacity-50"
          >
            {create.isPending ? "Đang khởi tạo..." : "+ Tạo dịch vụ mới"}
          </button>
        </form>

        {/* Services List Grid */}
        <div className="space-y-4 rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#eee7d8] pb-3.5">
            <h2 className="text-lg font-extrabold text-[#17201b] flex items-center gap-2">
              <span>📦</span> Danh sách dịch vụ hiện có
              <span className="rounded-full bg-[#e8f2ee] px-2.5 py-0.5 text-xs font-bold text-[#1c553f] border border-[#c1e0d3]">
                {data.services.length}
              </span>
            </h2>
          </div>

          {data.services.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.services.map((item) => (
                <article
                  key={item.id}
                  className="space-y-3 rounded-xl border border-[#eae3d5] bg-[#f9f6f0] p-4 transition-all hover:bg-white hover:shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-block rounded-md bg-[#f4ebd9] px-2 py-0.5 text-xs font-bold text-[#8c6d29] mb-1">
                        {item.category?.nameVi ?? "Dịch vụ"}
                      </span>
                      <h3 className="font-bold text-[#17201b] text-base">{item.name}</h3>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#3d4942] border border-[#e5ddcd]">
                      {item.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-[#46534b] border-t border-[#eae3d5] pt-3 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>Đơn giá:</span>
                      <span className="font-bold text-[#17201b] text-base">
                        {Number(item.unitPrice).toLocaleString("vi-VN")} VND
                      </span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Thời gian chuẩn bị:</span>
                      <span className="font-semibold text-[#17201b]">{item.waitingMinutes} phút</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Hình thức:</span>
                      <span className="font-semibold text-[#17201b]">
                        {item.mode === "DELIVERY_TO_HOTEL" ? "Giao tới khách sạn" : "Khách tới địa điểm"}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#dcd3c1] p-10 text-center text-sm font-medium text-[#65726a]">
              Chưa có dịch vụ nào trong menu. Vui lòng điền form bên trái để tạo dịch vụ mới.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
