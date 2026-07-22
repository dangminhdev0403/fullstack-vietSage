"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelServiceCategory,
  HotelServiceItem,
  HotelServiceStatus,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { hotelServiceStatuses } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  formatMoney,
  serviceStatusLabelMap,
  serviceStatusTone,
} from "@/features/hotel-ops/utils/hotel-ops-display";

type ServiceCatalogClientProps = {
  hotelId: string;
  initialCategories: HotelServiceCategory[];
  initialItems: HotelServiceItem[];
};

type CategoryFormState = {
  id?: string;
  name: string;
  description: string;
  id_group: string;
  sortOrder: string;
  status: HotelServiceStatus;
};

type ItemFormState = {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  sortOrder: string;
  status: HotelServiceStatus;
};

const emptyCategoryForm: CategoryFormState = {
  name: "",
  description: "",
  id_group: "",
  sortOrder: "0",
  status: "ACTIVE",
};

function emptyItemForm(categoryId = ""): ItemFormState {
  return {
    categoryId,
    name: "",
    description: "",
    price: "",
    currency: "USD",
    sortOrder: "0",
    status: "ACTIVE",
  };
}

function toNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ServiceCatalogClient({
  hotelId,
  initialCategories,
  initialItems,
}: ServiceCatalogClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"categories" | "items">("categories");
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesQuery = !normalizedQuery || `${category.name} ${category.description ?? ""}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = !statusFilter || category.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [categories, query, statusFilter]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(normalizedQuery);
      const matchesCategory = !categoryFilter || item.categoryId === categoryFilter;
      const matchesStatus = !statusFilter || item.status === statusFilter;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, items, query, statusFilter]);

  function refreshRoute() {
    router.refresh();
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
        id_group: categoryForm.id_group.trim() || null,
        defaultPrice: 0,
        currency: "USD",
        sortOrder: toNumber(categoryForm.sortOrder) ?? 0,
        status: categoryForm.status,
      };
      const path = categoryForm.id
        ? `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/service-categories/${encodeURIComponent(categoryForm.id)}`
        : `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/service-categories`;
      const saved = categoryForm.id
        ? (await requestInternalApiEnvelope<HotelServiceCategory>(path, { method: "PATCH", body: payload })).data
        : (await requestInternalApiEnvelope<HotelServiceCategory>(path, { method: "POST", body: payload })).data;

      setCategories((current) => {
        const exists = current.some((category) => category.id === saved.id);
        return exists ? current.map((category) => (category.id === saved.id ? saved : category)) : [saved, ...current];
      });
      setCategoryForm(null);
      refreshRoute();
    } catch {
      setError("Không thể lưu nhóm dịch vụ. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const price = itemForm.price.trim() ? Number(itemForm.price) : undefined;
      const payload = {
        categoryId: itemForm.categoryId,
        name: itemForm.name.trim(),
        description: itemForm.description.trim() || undefined,
        priceOverride: Number.isFinite(price) ? price : null,
        sortOrder: toNumber(itemForm.sortOrder) ?? 0,
        status: itemForm.status,
      };
      const path = itemForm.id
        ? `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/service-items/${encodeURIComponent(itemForm.id)}`
        : `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/service-items`;
      const saved = itemForm.id
        ? (await requestInternalApiEnvelope<HotelServiceItem>(path, { method: "PATCH", body: payload })).data
        : (await requestInternalApiEnvelope<HotelServiceItem>(path, { method: "POST", body: payload })).data;

      setItems((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current];
      });
      setItemForm(null);
      refreshRoute();
    } catch {
      setError("Không thể lưu dịch vụ. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCategory(category: HotelServiceCategory) {
    const isDeactivating = category.status === "ACTIVE";
    const actionText = isDeactivating ? "vô hiệu hóa" : "kích hoạt";
    const actionTitle = isDeactivating ? "Vô hiệu hóa nhóm dịch vụ?" : "Kích hoạt nhóm dịch vụ?";

    const result = await Swal.fire({
      title: actionTitle,
      html: `Bạn có chắc chắn muốn <strong>${actionText}</strong> nhóm dịch vụ <strong>"${category.name}"</strong> không?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: isDeactivating ? "Vô hiệu hóa" : "Kích hoạt",
      cancelButtonText: "Hủy",
      confirmButtonColor: isDeactivating ? "#ba1a1a" : "#1b6d3a",
      cancelButtonColor: "#767684",
    });

    if (!result.isConfirmed) return;

    try {
      const nextStatus: HotelServiceStatus = isDeactivating ? "DISABLED" : "ACTIVE";
      const saved = (await requestInternalApiEnvelope<HotelServiceCategory>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/service-categories/${encodeURIComponent(category.id)}`,
        { method: "PATCH", body: { status: nextStatus } },
      )).data;
      setCategories((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      refreshRoute();
      await Swal.fire({
        icon: "success",
        title: `Đã ${actionText} nhóm dịch vụ!`,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái",
        text: "Vui lòng thử lại sau.",
      });
    }
  }

  async function toggleItem(item: HotelServiceItem) {
    const isDeactivating = item.status === "ACTIVE";
    const actionText = isDeactivating ? "vô hiệu hóa" : "kích hoạt";
    const actionTitle = isDeactivating ? "Vô hiệu hóa dịch vụ?" : "Kích hoạt dịch vụ?";

    const result = await Swal.fire({
      title: actionTitle,
      html: `Bạn có chắc chắn muốn <strong>${actionText}</strong> dịch vụ <strong>"${item.name}"</strong> không?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: isDeactivating ? "Vô hiệu hóa" : "Kích hoạt",
      cancelButtonText: "Hủy",
      confirmButtonColor: isDeactivating ? "#ba1a1a" : "#1b6d3a",
      cancelButtonColor: "#767684",
    });

    if (!result.isConfirmed) return;

    try {
      const nextStatus: HotelServiceStatus = isDeactivating ? "DISABLED" : "ACTIVE";
      const saved = (await requestInternalApiEnvelope<HotelServiceItem>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/service-items/${encodeURIComponent(item.id)}`,
        { method: "PATCH", body: { status: nextStatus } },
      )).data;
      setItems((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      refreshRoute();
      await Swal.fire({
        icon: "success",
        title: `Đã ${actionText} dịch vụ!`,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái",
        text: "Vui lòng thử lại sau.",
      });
    }
  }

  const categoryColumns: DataTableColumn<HotelServiceCategory>[] = [
    {
      key: "name",
      header: "Tên nhóm",
      cell: (category) => <span className="text-base font-semibold text-[var(--primary)]">{category.name}</span>,
    },
    {
      key: "description",
      header: "Mô tả",
      cell: (category) => <span className="text-sm text-[var(--on-surface-variant)]">{category.description ?? "-"}</span>,
    },
    {
      key: "telegram",
      header: "Telegram Group ID",
      headerClassName: "text-center",
      className: "text-center",
      cell: (category) =>
        category.id_group ? (
          <span className="inline-block rounded-full bg-[var(--primary-fixed)] px-3 py-1 text-xs font-bold text-[var(--on-primary-fixed-variant)]">
            {category.id_group}
          </span>
        ) : (
          <span className="text-sm text-[var(--on-surface-variant)]">Tùy chọn</span>
        ),
    },
    {
      key: "sort",
      header: "Thứ tự sắp xếp",
      headerClassName: "text-center",
      className: "text-center",
      cell: (category) => <span className="text-base font-semibold text-[var(--on-surface)]">{category.sortOrder}</span>,
    },
    {
      key: "status",
      header: "Trạng thái",
      headerClassName: "text-center",
      className: "text-center",
      cell: (category) => (
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${serviceStatusTone(category.status)}`}>
          {serviceStatusLabelMap[category.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Thao tác (Bật/Tắt)",
      headerClassName: "text-right",
      className: "text-right",
      cell: (category) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void toggleCategory(category)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              category.status === "ACTIVE"
                ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            {category.status === "ACTIVE" ? "Vô hiệu hóa" : "Kích hoạt"}
          </button>
        </div>
      ),
    },
  ];

  const itemColumns: DataTableColumn<HotelServiceItem>[] = [
    {
      key: "item",
      header: "Tên dịch vụ",
      cell: (item) => (
        <div>
          <div className="text-base font-semibold text-[var(--primary)]">{item.name}</div>
          <div className="max-w-md truncate text-sm text-[var(--on-surface-variant)]">{item.description ?? "-"}</div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Nhóm dịch vụ",
      cell: (item) => <span className="text-base font-medium text-[var(--on-surface)]">{categoryById.get(item.categoryId)?.name ?? item.categoryId}</span>,
    },
    {
      key: "price",
      header: "Giá tiền",
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) => <span className="text-base font-semibold text-[var(--primary)]">{formatMoney(item)}</span>,
    },
    {
      key: "sort",
      header: "Thứ tự",
      headerClassName: "text-center",
      className: "text-center",
      cell: (item) => <span className="text-base font-semibold text-[var(--on-surface)]">{item.sortOrder}</span>,
    },
    {
      key: "status",
      header: "Trạng thái",
      headerClassName: "text-center",
      className: "text-center",
      cell: (item) => (
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${serviceStatusTone(item.status)}`}>
          {serviceStatusLabelMap[item.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Thao tác (Bật/Tắt)",
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void toggleItem(item)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              item.status === "ACTIVE"
                ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            {item.status === "ACTIVE" ? "Vô hiệu hóa" : "Kích hoạt"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-lg bg-[var(--surface-container-low)] p-1">
          <button type="button" onClick={() => setTab("categories")} className={`rounded-md px-5 py-2 text-base font-semibold ${tab === "categories" ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--on-surface-variant)]"}`}>Nhóm dịch vụ</button>
          <button type="button" onClick={() => setTab("items")} className={`rounded-md px-5 py-2 text-base font-semibold ${tab === "items" ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--on-surface-variant)]"}`}>Dịch vụ</button>
        </div>

        <div className="flex flex-1 flex-col gap-2 lg:max-w-4xl lg:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm dịch vụ..." className="min-h-11 flex-1 rounded-lg border border-[color:rgba(198,197,213,0.55)] px-4 text-base outline-none focus:border-[var(--primary)]" />
          {tab === "items" ? (
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 rounded-lg border border-[color:rgba(198,197,213,0.55)] px-4 text-base">
              <option value="">Tất cả nhóm</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          ) : null}
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 rounded-lg border border-[color:rgba(198,197,213,0.55)] px-4 text-base">
            <option value="">Tất cả trạng thái</option>
            {hotelServiceStatuses.map((status) => <option key={status} value={status}>{serviceStatusLabelMap[status]}</option>)}
          </select>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-[var(--error)] bg-[var(--error-container)] p-3 text-sm font-semibold text-[var(--on-error-container)]">{error}</div> : null}

      {tab === "categories" ? (
        <DataTable
          columns={categoryColumns}
          data={filteredCategories}
          getRowKey={(category) => category.id}
          emptyMessage="Không tìm thấy nhóm dịch vụ nào khớp với bộ lọc."
          minWidth="860px"
          rowClassName={(category) => category.status === "DISABLED" ? "bg-zinc-50 text-zinc-500" : ""}
        />
      ) : (
        <DataTable
          columns={itemColumns}
          data={filteredItems}
          getRowKey={(item) => item.id}
          emptyMessage="Không tìm thấy dịch vụ nào khớp với bộ lọc."
          minWidth="980px"
          rowClassName={(item) => item.status === "DISABLED" ? "bg-zinc-50 text-zinc-500" : ""}
        />
      )}

      {categoryForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <form onSubmit={saveCategory} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="vs-display mb-5 text-2xl font-semibold text-[var(--primary)]">{categoryForm.id ? "Sửa nhóm dịch vụ" : "Thêm nhóm dịch vụ"}</h2>
            <div className="space-y-4">
              <input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Tên nhóm" className="w-full rounded-lg border px-3 py-2" />
              <textarea value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} placeholder="Mô tả" className="w-full rounded-lg border px-3 py-2" />
              <input value={categoryForm.id_group} onChange={(event) => setCategoryForm({ ...categoryForm, id_group: event.target.value })} placeholder="Mã nhóm Telegram (tùy chọn)" className="w-full rounded-lg border px-3 py-2" />
              <p className="text-xs text-[var(--on-surface-variant)]">Chỉ điền khi nhóm dịch vụ này cần gửi thông báo Telegram riêng.</p>
              <input type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} placeholder="Thứ tự sắp xếp" className="w-full rounded-lg border px-3 py-2" />
              <select value={categoryForm.status} onChange={(event) => setCategoryForm({ ...categoryForm, status: event.target.value as HotelServiceStatus })} className="w-full rounded-lg border px-3 py-2">
                {hotelServiceStatuses.map((status) => <option key={status} value={status}>{serviceStatusLabelMap[status]}</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCategoryForm(null)} className="rounded-lg px-4 py-2 text-sm font-semibold">Hủy</button><button disabled={isSaving} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">Lưu</button></div>
          </form>
        </div>
      ) : null}

      {itemForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <form onSubmit={saveItem} className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="vs-display mb-5 text-2xl font-semibold text-[var(--primary)]">{itemForm.id ? "Sửa dịch vụ" : "Thêm dịch vụ"}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} placeholder="Tên dịch vụ" className="rounded-lg border px-3 py-2" />
              <select required value={itemForm.categoryId} onChange={(event) => setItemForm({ ...itemForm, categoryId: event.target.value })} className="rounded-lg border px-3 py-2">
                <option value="">Chọn nhóm dịch vụ</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select value={itemForm.status} onChange={(event) => setItemForm({ ...itemForm, status: event.target.value as HotelServiceStatus })} className="rounded-lg border px-3 py-2">
                {hotelServiceStatuses.map((status) => <option key={status} value={status}>{serviceStatusLabelMap[status]}</option>)}
              </select>
              <input type="number" step="0.01" value={itemForm.price} onChange={(event) => setItemForm({ ...itemForm, price: event.target.value })} placeholder="Giá dịch vụ" className="rounded-lg border px-3 py-2" />
              <input value={itemForm.currency} onChange={(event) => setItemForm({ ...itemForm, currency: event.target.value })} placeholder="Đơn vị tiền tệ (ví dụ: VND, USD)" className="rounded-lg border px-3 py-2" />
              <input type="number" value={itemForm.sortOrder} onChange={(event) => setItemForm({ ...itemForm, sortOrder: event.target.value })} placeholder="Thứ tự" className="rounded-lg border px-3 py-2" />
              <textarea value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} placeholder="Mô tả" className="min-h-24 rounded-lg border px-3 py-2 md:col-span-2" />
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setItemForm(null)} className="rounded-lg px-4 py-2 text-sm font-semibold">Hủy</button><button disabled={isSaving} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">Lưu</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
