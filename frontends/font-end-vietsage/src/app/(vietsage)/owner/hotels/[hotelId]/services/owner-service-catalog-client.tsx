"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { HttpError } from "@/core/http/http-error";
import { requestInternalApi, requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelServiceCategory, HotelServiceItem, HotelServiceStatus } from "@/features/hotel-ops/types/hotel-ops-contract";
import { hotelServiceStatuses } from "@/features/hotel-ops/types/hotel-ops-contract";
import { serviceStatusLabelMap, serviceStatusTone } from "@/features/hotel-ops/utils/hotel-ops-display";

type Props = {
  hotelId: string;
  initialCategories: HotelServiceCategory[];
  initialItems: HotelServiceItem[];
};

type PriceUpdateMode = "CATEGORY_ONLY" | "OVERRIDE_ALL_ITEMS";
type SortDirection = "asc" | "desc";
type CategorySortKey = "name" | "price" | "sortOrder" | "status";
type ItemSortKey = "name" | "category" | "price" | "status";
type SortState<TKey extends string> = {
  key: TKey;
  direction: SortDirection;
};
type PageSize = 10 | 25 | 50;
type CatalogPage<TItem> = { items: TItem[] };

type BaseLocale = "vi";
type TranslationLocale = "en" | "zh" | "ko" | "ru" | "hi";
type CatalogLocale = BaseLocale | TranslationLocale;
type TranslationFormValue = { name: string; description: string };
type TranslationFormState = Record<TranslationLocale, TranslationFormValue>;

type CategoryFormState = {
  id?: string;
  name: string;
  description: string;
  defaultPrice: string;
  originalDefaultPrice: string;
  currency: string;
  priceUpdateMode: PriceUpdateMode;
  sortOrder: string;
  status: HotelServiceStatus;
  activeLocale: CatalogLocale;
  translations: TranslationFormState;
};

type ItemFormState = {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  priceOverride: string;
  quantityEnabled: boolean;
  minQuantity: string;
  maxQuantity: string;
  sortOrder: string;
  status: HotelServiceStatus;
  activeLocale: CatalogLocale;
  translations: TranslationFormState;
};

const catalogLocales: Array<{ key: CatalogLocale; label: string }> = [
  { key: "vi", label: "Tiếng Việt" },
  { key: "en", label: "English" },
  { key: "zh", label: "中文" },
  { key: "ko", label: "한국어" },
  { key: "ru", label: "Русский" },
  { key: "hi", label: "हिन्दी" },
];
const translationLocales = catalogLocales.filter((locale): locale is { key: TranslationLocale; label: string } => locale.key !== "vi");

function emptyTranslations(): TranslationFormState {
  return Object.fromEntries(translationLocales.map(({ key }) => [key, { name: "", description: "" }])) as TranslationFormState;
}

const emptyCategoryForm: CategoryFormState = {
  name: "",
  description: "",
  defaultPrice: "",
  originalDefaultPrice: "",
  currency: "VND",
  priceUpdateMode: "CATEGORY_ONLY",
  sortOrder: "",
  status: "ACTIVE",
  activeLocale: "vi",
  translations: emptyTranslations(),
};

const pageSizeOptions: PageSize[] = [10, 25, 50];

function emptyItemForm(categoryId = ""): ItemFormState {
  return { categoryId, name: "", description: "", priceOverride: "", quantityEnabled: false, minQuantity: "1", maxQuantity: "", sortOrder: "0", status: "ACTIVE", activeLocale: "vi", translations: emptyTranslations() };
}

function toNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toPositiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toRawPriceDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPriceInput(value: string): string {
  const raw = toRawPriceDigits(value);
  return raw ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(raw)) : "";
}

function toPriceString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return toRawPriceDigits(String(value));
}

function formatVnd(value: string | number | null | undefined, currency = "VND"): string {
  if (value === null || value === undefined || value === "") return "--";
  const amount = typeof value === "number" ? value : Number(toRawPriceDigits(String(value)));
  if (!Number.isFinite(amount)) return "--";

  return currency.toUpperCase() === "VND"
    ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} ₫`
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} ${currency.toUpperCase()}`;
}

function formatQuantityRule(item: Pick<HotelServiceItem, "quantityEnabled" | "minQuantity" | "maxQuantity">): string {
  if (!item.quantityEnabled) return "Không yêu cầu số lượng";
  return item.maxQuantity === null ? `SL ${item.minQuantity}+` : `SL ${item.minQuantity}-${item.maxQuantity}`;
}

function toComparablePrice(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function toggleSort<TKey extends string>(current: SortState<TKey>, key: TKey): SortState<TKey> {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

function sortIndicator<TKey extends string>(sort: SortState<TKey>, key: TKey): string {
  if (sort.key !== key) return "↕";
  return sort.direction === "asc" ? "↑" : "↓";
}

function sortableHeaderClass(isActive: boolean): string {
  return `inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:bg-white hover:text-[var(--primary)] ${isActive ? "text-[var(--primary)]" : "text-[var(--on-surface-variant)]"}`;
}

function getPageCount(totalItems: number, pageSize: PageSize): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function getPageBounds(totalItems: number, page: number, pageSize: PageSize): { start: number; end: number } {
  if (totalItems === 0) return { start: 0, end: 0 };

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);
  return { start, end };
}

function getPageItems<TItem>(items: TItem[], page: number, pageSize: PageSize): TItem[] {
  const startIndex = (page - 1) * pageSize;
  return items.slice(startIndex, startIndex + pageSize);
}

function PaginationControls({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: PageSize;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}) {
  const pageCount = getPageCount(totalItems, pageSize);
  const bounds = getPageBounds(totalItems, page, pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3 text-sm text-[var(--on-surface-variant)] md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span>Hiển thị</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)} className="h-9 rounded-lg border border-[var(--outline-variant)] bg-white px-2 text-sm outline-none focus:border-[var(--primary)]">
          {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span>dòng</span>
        <span className="font-semibold text-[var(--primary)]">{bounds.start}-{bounds.end}</span>
        <span>/ {totalItems}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="rounded-lg border border-[var(--outline-variant)] bg-white px-3 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-50">Trước</button>
        <span className="min-w-24 text-center text-sm font-semibold text-[var(--primary)]">{page} / {pageCount}</span>
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className="rounded-lg border border-[var(--outline-variant)] bg-white px-3 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-50">Sau</button>
      </div>
    </div>
  );
}

function getItemCategory(item: HotelServiceItem, categoryById: Map<string, HotelServiceCategory>): HotelServiceCategory | null {
  return categoryById.get(item.categoryId) ?? item.category ?? null;
}

function getItemCurrency(item: HotelServiceItem, category: HotelServiceCategory | null): string {
  return item.effectiveCurrency ?? category?.currency ?? "VND";
}

function getItemEffectivePrice(item: HotelServiceItem, category: HotelServiceCategory | null): string | number | null | undefined {
  return item.priceOverride ?? category?.defaultPrice ?? item.effectivePrice;
}

function syncItemsForCategoryUpdate(items: HotelServiceItem[], category: HotelServiceCategory, priceUpdateMode: PriceUpdateMode): HotelServiceItem[] {
  return items.map((item) => {
    if (item.categoryId !== category.id) return item;

    const priceOverride = priceUpdateMode === "OVERRIDE_ALL_ITEMS" ? category.defaultPrice : item.priceOverride;

    return {
      ...item,
      category,
      priceOverride,
      effectivePrice: priceOverride ?? category.defaultPrice,
      effectiveCurrency: category.currency,
    };
  });
}

function translationsToForm(translations?: Array<{ locale: string; name: string; description: string | null }> | Record<string, { name?: string; description?: string | null }>): TranslationFormState {
  const form = emptyTranslations();
  const entries = Array.isArray(translations)
    ? translations
    : Object.entries(translations ?? {}).map(([locale, value]) => ({ locale, name: value?.name ?? "", description: value?.description ?? null }));
  for (const translation of entries) {
    if (translation.locale in form) {
      form[translation.locale as TranslationLocale] = {
        name: translation.name,
        description: translation.description ?? "",
      };
    }
  }
  return form;
}

function translationsFromForm(translations: TranslationFormState) {
  return Object.fromEntries(
    translationLocales
      .map(({ key }) => {
        const value = translations[key];
        return [key, value.name.trim() ? { name: value.name.trim(), description: value.description.trim() || null } : undefined] as const;
      })
      .filter((entry): entry is [TranslationLocale, { name: string; description: string | null }] => Boolean(entry[1])),
  );
}

function categoryToForm(category: HotelServiceCategory): CategoryFormState {
  const defaultPrice = toPriceString(category.defaultPrice);
  return {
    id: category.id,
    name: category.name,
    description: category.description ?? "",
    defaultPrice,
    originalDefaultPrice: defaultPrice,
    currency: category.currency || "VND",
    priceUpdateMode: "CATEGORY_ONLY",
    sortOrder: String(category.sortOrder),
    status: category.status,
    activeLocale: "vi",
    translations: translationsToForm(category.translations),
  };
}

function itemToForm(item: HotelServiceItem): ItemFormState {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description ?? "",
    priceOverride: toPriceString(item.priceOverride),
    quantityEnabled: item.quantityEnabled,
    minQuantity: String(item.minQuantity),
    maxQuantity: item.maxQuantity === null ? "" : String(item.maxQuantity),
    sortOrder: String(item.sortOrder),
    status: item.status,
    activeLocale: "vi",
    translations: translationsToForm(item.translations),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTechnicalMessage(message: string): boolean {
  return /PRISMA_|Prisma|Record to update not found|Foreign key constraint|Unique constraint/i.test(message);
}

function getNestedMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  for (const candidate of [value.detail, value.message, value.errorMessage]) {
    if (typeof candidate === "string" && candidate.trim() && !isTechnicalMessage(candidate)) return candidate.trim();
  }

  return getNestedMessage(value.data) ?? getNestedMessage(value.error);
}

function getBusinessErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpError) return getNestedMessage(error.data) ?? fallback;
  if (error instanceof Error && error.message && !isTechnicalMessage(error.message)) return error.message;
  return fallback;
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

function closeLoading() {
  Swal.close();
}

export function OwnerServiceCatalogClient({ hotelId, initialCategories, initialItems }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"categories" | "items">("categories");
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [categorySort, setCategorySort] = useState<SortState<CategorySortKey>>({ key: "name", direction: "asc" });
  const [itemSort, setItemSort] = useState<SortState<ItemSortKey>>({ key: "name", direction: "asc" });
  const [categoryPage, setCategoryPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [categoryPageSize, setCategoryPageSize] = useState<PageSize>(10);
  const [itemPageSize, setItemPageSize] = useState<PageSize>(10);


  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCategories = useMemo(() => categories.filter((category) => !normalizedQuery || `${category.name} ${category.description ?? ""}`.toLowerCase().includes(normalizedQuery)), [categories, normalizedQuery]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const category = getItemCategory(item, categoryById);
    return !normalizedQuery || `${item.name} ${item.description ?? ""} ${category?.name ?? ""}`.toLowerCase().includes(normalizedQuery);
  }), [categoryById, items, normalizedQuery]);
  const sortedCategories = useMemo(() => [...filteredCategories].sort((left, right) => {
    let result = 0;

    if (categorySort.key === "name") {
      result = left.name.localeCompare(right.name, "vi", { sensitivity: "base" });
    } else if (categorySort.key === "price") {
      result = toComparablePrice(left.defaultPrice) - toComparablePrice(right.defaultPrice);
    } else if (categorySort.key === "sortOrder") {
      result = left.sortOrder - right.sortOrder;
    } else {
      result = serviceStatusLabelMap[left.status].localeCompare(serviceStatusLabelMap[right.status], "vi", { sensitivity: "base" });
    }

    return categorySort.direction === "asc" ? result : -result;
  }), [categorySort, filteredCategories]);
  const sortedItems = useMemo(() => [...filteredItems].sort((left, right) => {
    const leftCategory = getItemCategory(left, categoryById);
    const rightCategory = getItemCategory(right, categoryById);
    const leftPrice = getItemEffectivePrice(left, leftCategory);
    const rightPrice = getItemEffectivePrice(right, rightCategory);
    let result = 0;

    if (itemSort.key === "name") {
      result = left.name.localeCompare(right.name, "vi", { sensitivity: "base" });
    } else if (itemSort.key === "category") {
      result = (leftCategory?.name ?? left.categoryId).localeCompare(rightCategory?.name ?? right.categoryId, "vi", { sensitivity: "base" });
    } else if (itemSort.key === "price") {
      result = toComparablePrice(leftPrice) - toComparablePrice(rightPrice);
    } else {
      result = serviceStatusLabelMap[left.status].localeCompare(serviceStatusLabelMap[right.status], "vi", { sensitivity: "base" });
    }

    return itemSort.direction === "asc" ? result : -result;
  }), [categoryById, filteredItems, itemSort]);
  const categoryPageCount = getPageCount(sortedCategories.length, categoryPageSize);
  const itemPageCount = getPageCount(sortedItems.length, itemPageSize);
  const activeCategoryPage = Math.min(categoryPage, categoryPageCount);
  const activeItemPage = Math.min(itemPage, itemPageCount);
  const paginatedCategories = useMemo(() => getPageItems(sortedCategories, activeCategoryPage, categoryPageSize), [activeCategoryPage, categoryPageSize, sortedCategories]);
  const paginatedItems = useMemo(() => getPageItems(sortedItems, activeItemPage, itemPageSize), [activeItemPage, itemPageSize, sortedItems]);

  const categoryColumns = useMemo<DataTableColumn<HotelServiceCategory>[]>(() => [
    {
      key: "name",
      header: <button type="button" onClick={() => setCategorySort((current) => toggleSort(current, "name"))} className={sortableHeaderClass(categorySort.key === "name")}>Tên <span className="text-[10px] normal-case tracking-normal">{sortIndicator(categorySort, "name")}</span></button>,
      cell: (category) => (
        <div>
          <p className="font-semibold text-[var(--primary)]">{category.name}</p>
          <p className="text-xs text-[var(--on-surface-variant)]">{category.description ?? "--"}</p>
        </div>
      ),
    },
    {
      key: "price",
      header: <button type="button" onClick={() => setCategorySort((current) => toggleSort(current, "price"))} className={sortableHeaderClass(categorySort.key === "price")}>Giá mặc định <span className="text-[10px] normal-case tracking-normal">{sortIndicator(categorySort, "price")}</span></button>,
      cell: (category) => <span className="font-semibold">{formatVnd(category.defaultPrice, category.currency)}</span>,
    },
    {
      key: "sortOrder",
      header: <button type="button" onClick={() => setCategorySort((current) => toggleSort(current, "sortOrder"))} className={sortableHeaderClass(categorySort.key === "sortOrder")}>Thứ tự <span className="text-[10px] normal-case tracking-normal">{sortIndicator(categorySort, "sortOrder")}</span></button>,
      cell: (category) => category.sortOrder,
    },
    {
      key: "status",
      header: <button type="button" onClick={() => setCategorySort((current) => toggleSort(current, "status"))} className={sortableHeaderClass(categorySort.key === "status")}>Trạng thái <span className="text-[10px] normal-case tracking-normal">{sortIndicator(categorySort, "status")}</span></button>,
      cell: (category) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${serviceStatusTone(category.status)}`}>{serviceStatusLabelMap[category.status]}</span>,
    },
    {
      key: "actions",
      header: "Thao tác",
      headerClassName: "text-right",
      className: "text-right",
      cell: (category) => <button type="button" onClick={() => setCategoryForm(categoryToForm(category))} className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)]">Sửa</button>,
    },
  ], [categorySort]);

  const itemColumns = useMemo<DataTableColumn<HotelServiceItem>[]>(() => [
    {
      key: "name",
      header: <button type="button" onClick={() => setItemSort((current) => toggleSort(current, "name"))} className={sortableHeaderClass(itemSort.key === "name")}>Tên dịch vụ <span className="text-[10px] normal-case tracking-normal">{sortIndicator(itemSort, "name")}</span></button>,
      cell: (item) => (
        <div>
          <p className="font-semibold text-[var(--primary)]">{item.name}</p>
          <p className="text-xs text-[var(--on-surface-variant)]">{item.description ?? "--"}</p>
        </div>
      ),
    },
    {
      key: "category",
      header: <button type="button" onClick={() => setItemSort((current) => toggleSort(current, "category"))} className={sortableHeaderClass(itemSort.key === "category")}>Nhóm dịch vụ <span className="text-[10px] normal-case tracking-normal">{sortIndicator(itemSort, "category")}</span></button>,
      cell: (item) => {
        const category = getItemCategory(item, categoryById);
        return category?.name ?? item.categoryId;
      },
    },
    {
      key: "price",
      header: <button type="button" onClick={() => setItemSort((current) => toggleSort(current, "price"))} className={sortableHeaderClass(itemSort.key === "price")}>Giá <span className="text-[10px] normal-case tracking-normal">{sortIndicator(itemSort, "price")}</span></button>,
      cell: (item) => {
        const category = getItemCategory(item, categoryById);
        const hasOverride = item.priceOverride !== null && item.priceOverride !== undefined && item.priceOverride !== "";
        return (
          <div>
            <p className="font-semibold">{formatVnd(getItemEffectivePrice(item, category), getItemCurrency(item, category))}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${hasOverride ? "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed-variant)]" : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"}`}>{hasOverride ? "Giá riêng" : "Theo nhóm"}</span>
              <span className="inline-flex rounded-full bg-[var(--surface-container-high)] px-2.5 py-1 text-xs font-bold text-[var(--on-surface-variant)]">{formatQuantityRule(item)}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: <button type="button" onClick={() => setItemSort((current) => toggleSort(current, "status"))} className={sortableHeaderClass(itemSort.key === "status")}>Trạng thái <span className="text-[10px] normal-case tracking-normal">{sortIndicator(itemSort, "status")}</span></button>,
      cell: (item) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${serviceStatusTone(item.status)}`}>{serviceStatusLabelMap[item.status]}</span>,
    },
    {
      key: "actions",
      header: "Thao tác",
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) => <button type="button" onClick={() => setItemForm(itemToForm(item))} className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)]">Sửa</button>,
    },
  ], [categoryById, itemSort]);

  async function selectOverrideAllItemsMode() {
    if (!categoryForm || categoryForm.priceUpdateMode === "OVERRIDE_ALL_ITEMS") return;

    const confirmed = await Swal.fire({
      icon: "warning",
      title: "Ghi đè giá dịch vụ con?",
      text: "Thao tác này sẽ thay thế toàn bộ giá riêng hiện có của các dịch vụ trong nhóm.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#767684",
    });

    if (confirmed.isConfirmed) {
      setCategoryForm({ ...categoryForm, priceUpdateMode: "OVERRIDE_ALL_ITEMS" });
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryForm) return;

    const defaultPrice = Number(categoryForm.defaultPrice);
    const sortOrder = Number(categoryForm.sortOrder);
    if (!categoryForm.name.trim()) {
      await Swal.fire({ icon: "warning", title: "Thiếu tên nhóm", text: "Vui lòng nhập tên nhóm dịch vụ.", confirmButtonColor: "#00003c" });
      return;
    }

    if (!/^\d+$/.test(categoryForm.defaultPrice) || !Number.isFinite(defaultPrice) || defaultPrice < 0) {
      await Swal.fire({ icon: "warning", title: "Giá mặc định không hợp lệ", text: "Vui lòng nhập giá mặc định dạng số.", confirmButtonColor: "#00003c" });
      return;
    }

    if (!categoryForm.currency.trim()) {
      await Swal.fire({ icon: "warning", title: "Thiếu tiền tệ", text: "Vui lòng nhập tiền tệ.", confirmButtonColor: "#00003c" });
      return;
    }

    if (!/^\d+$/.test(categoryForm.sortOrder) || !Number.isFinite(sortOrder) || sortOrder < 0) {
      await Swal.fire({ icon: "warning", title: "Thứ tự hiển thị không hợp lệ", text: "Vui lòng nhập thứ tự hiển thị từ 0 trở lên.", confirmButtonColor: "#00003c" });
      return;
    }


    const confirmed = await Swal.fire({
      icon: "question",
      title: categoryForm.id ? "Lưu nhóm dịch vụ?" : "Tạo nhóm dịch vụ?",
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
      showLoading(categoryForm.id ? "Đang lưu nhóm dịch vụ" : "Đang tạo nhóm dịch vụ");
      const priceChanged = categoryForm.defaultPrice !== categoryForm.originalDefaultPrice;
      const body = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
        defaultPrice,
        currency: categoryForm.currency.trim().toUpperCase() || "VND",
        ...(categoryForm.id && priceChanged ? { priceUpdateMode: categoryForm.priceUpdateMode } : {}),
        sortOrder,
        status: categoryForm.status,
        translations: translationsFromForm(categoryForm.translations),
      };
      const path = categoryForm.id
        ? `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-categories/${encodeURIComponent(categoryForm.id)}`
        : `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-categories`;
      const saved = (await requestInternalApiEnvelope<HotelServiceCategory>(path, { method: categoryForm.id ? "PATCH" : "POST", body })).data;

      setCategories((current) => current.some((category) => category.id === saved.id) ? current.map((category) => category.id === saved.id ? saved : category) : [saved, ...current]);
      setItems((current) => syncItemsForCategoryUpdate(current, saved, categoryForm.priceUpdateMode));
      setCategoryForm(null);
      await Swal.fire({ icon: "success", title: "Đã lưu nhóm dịch vụ", timer: 1300, showConfirmButton: false });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể lưu nhóm dịch vụ", text: getBusinessErrorMessage(error, "Vui lòng thử lại."), confirmButtonColor: "#00003c" });
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshServiceCatalog() {
    const encodedHotelId = encodeURIComponent(hotelId);
    const [categoriesPage, itemsPage] = await Promise.all([
      requestInternalApi<CatalogPage<HotelServiceCategory>>(`/api/owner/hotels/${encodedHotelId}/service-categories`, { method: "GET" }),
      requestInternalApi<CatalogPage<HotelServiceItem>>(`/api/owner/hotels/${encodedHotelId}/service-items`, { method: "GET" }),
    ]);

    setCategories(categoriesPage.items);
    setItems(itemsPage.items);
    setCategoryPage(1);
    setItemPage(1);
  }

  async function syncGoogleSheets() {
    const confirmed = await Swal.fire({ icon: "question", title: "Đồng bộ Google Sheets?", text: "Hệ thống sẽ đọc dữ liệu mới nhất từ Google Sheets và cập nhật catalog dịch vụ.", showCancelButton: true, reverseButtons: true, confirmButtonText: "Đồng bộ Google Sheets", cancelButtonText: "Hủy", confirmButtonColor: "#00003c", cancelButtonColor: "#767684" });
    if (!confirmed.isConfirmed) return;
    setIsImporting(true);
    try {
      showLoading("Đang đồng bộ Google Sheets");
      await requestInternalApiEnvelope(`/api/owner/hotels/${encodeURIComponent(hotelId)}/service-catalog/sync`, { method: "POST" });
      await refreshServiceCatalog();
      router.refresh();
      closeLoading();
      await Swal.fire({ icon: "success", title: "Đồng bộ Google Sheets thành công.", timer: 1300, showConfirmButton: false });
    } catch (error) {
      closeLoading();
      await Swal.fire({ icon: "error", title: "Không thể đồng bộ Google Sheets", text: getBusinessErrorMessage(error, "Vui lòng kiểm tra cấu hình Google Sheets và thử lại."), confirmButtonColor: "#00003c" });
    } finally {
      setIsImporting(false);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemForm) return;

    if (!itemForm.name.trim()) {
      await Swal.fire({ icon: "warning", title: "Thiếu tên dịch vụ", text: "Vui lòng nhập tên dịch vụ.", confirmButtonColor: "#00003c" });
      return;
    }

    if (!itemForm.categoryId) {
      await Swal.fire({ icon: "warning", title: "Thiếu nhóm dịch vụ", text: "Vui lòng chọn nhóm dịch vụ trước khi lưu.", confirmButtonColor: "#00003c" });
      return;
    }

    if (itemForm.priceOverride.trim() && !/^\d+$/.test(itemForm.priceOverride)) {
      await Swal.fire({ icon: "warning", title: "Giá riêng không hợp lệ", text: "Vui lòng nhập giá riêng dạng số.", confirmButtonColor: "#00003c" });
      return;
    }

    const minQuantity = toPositiveInteger(itemForm.minQuantity) ?? 1;
    const maxQuantity = itemForm.maxQuantity.trim() ? toPositiveInteger(itemForm.maxQuantity) : undefined;
    if (itemForm.quantityEnabled && itemForm.maxQuantity.trim() && (!maxQuantity || maxQuantity < minQuantity)) {
      await Swal.fire({ icon: "error", title: "Số lượng chưa hợp lệ", text: "Số lượng tối đa phải lớn hơn hoặc bằng số lượng tối thiểu.", confirmButtonColor: "#00003c" });
      return;
    }

    const confirmed = await Swal.fire({
      icon: "question",
      title: itemForm.id ? "Lưu dịch vụ?" : "Tạo dịch vụ?",
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
      showLoading(itemForm.id ? "Đang lưu dịch vụ" : "Đang tạo dịch vụ");
      const body = {
        categoryId: itemForm.categoryId,
        name: itemForm.name.trim(),
        description: itemForm.description.trim() || undefined,
        priceOverride: itemForm.priceOverride.trim() ? Number(itemForm.priceOverride) : null,
        quantityEnabled: itemForm.quantityEnabled,
        minQuantity,
        maxQuantity: itemForm.quantityEnabled ? (maxQuantity ?? null) : null,
        sortOrder: toNumber(itemForm.sortOrder) ?? 0,
        status: itemForm.status,
        translations: translationsFromForm(itemForm.translations),
      };
      const path = itemForm.id
        ? `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-items/${encodeURIComponent(itemForm.id)}`
        : `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-items`;
      const saved = (await requestInternalApiEnvelope<HotelServiceItem>(path, { method: itemForm.id ? "PATCH" : "POST", body })).data;

      setItems((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setItemForm(null);
      await Swal.fire({ icon: "success", title: "Đã lưu dịch vụ", timer: 1300, showConfirmButton: false });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể lưu dịch vụ", text: getBusinessErrorMessage(error, "Vui lòng thử lại."), confirmButtonColor: "#00003c" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-lg bg-[var(--surface-container-low)] p-1">
          <button type="button" onClick={() => setTab("categories")} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors ${tab === "categories" ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"}`}>Nhóm dịch vụ</button>
          <button type="button" onClick={() => setTab("items")} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors ${tab === "items" ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"}`}>Dịch vụ</button>
        </div>
        <div className="flex flex-1 flex-col gap-2 lg:max-w-3xl lg:flex-row">
          <input value={query} onChange={(event) => { setQuery(event.target.value); setCategoryPage(1); setItemPage(1); }} placeholder="Tìm dịch vụ" className="min-h-10 flex-1 rounded-lg border border-[var(--outline-variant)] px-3 text-sm outline-none transition-colors focus:border-[var(--primary)]" />
          <button type="button" onClick={() => tab === "categories" ? setCategoryForm(emptyCategoryForm) : setItemForm(emptyItemForm(categories[0]?.id ?? ""))} className="cursor-pointer rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[color:rgba(0,0,60,0.88)]">
            {tab === "categories" ? "Tạo nhóm" : "Tạo dịch vụ"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--primary)]">Đồng bộ dịch vụ bằng Google Sheets</h2>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Đọc dữ liệu mới nhất từ Google Sheets và cập nhật catalog dịch vụ ngay lập tức.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={syncGoogleSheets} disabled={isImporting} className="cursor-pointer rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[color:rgba(0,0,60,0.88)] disabled:cursor-not-allowed disabled:opacity-50">
              {isImporting ? "Đang đồng bộ..." : "Đồng bộ Google Sheets"}
            </button>
          </div>
        </div>
      </section>

      {tab === "categories" ? (
        <DataTable
          columns={categoryColumns}
          data={paginatedCategories}
          getRowKey={(category) => category.id}
          emptyMessage="Chưa có nhóm dịch vụ phù hợp."
          minWidth="760px"
          footer={(
            <PaginationControls
              page={activeCategoryPage}
              pageSize={categoryPageSize}
              totalItems={sortedCategories.length}
              onPageChange={setCategoryPage}
              onPageSizeChange={(nextPageSize) => {
                setCategoryPageSize(nextPageSize);
                setCategoryPage(1);
              }}
            />
          )}
        />
      ) : (
        <DataTable
          columns={itemColumns}
          data={paginatedItems}
          getRowKey={(item) => item.id}
          emptyMessage="Chưa có dịch vụ phù hợp."
          minWidth="860px"
          footer={(
            <PaginationControls
              page={activeItemPage}
              pageSize={itemPageSize}
              totalItems={sortedItems.length}
              onPageChange={setItemPage}
              onPageSizeChange={(nextPageSize) => {
                setItemPageSize(nextPageSize);
                setItemPage(1);
              }}
            />
          )}
        />
      )}

      {categoryForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <form noValidate onSubmit={saveCategory} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-5 text-2xl font-semibold text-[var(--primary)]">{categoryForm.id ? "Sửa nhóm dịch vụ" : "Tạo nhóm dịch vụ"}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Tên nhóm dịch vụ</span><input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="VD: Housekeeping" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" /></label>
              <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Giá mặc định</span><input required type="text" inputMode="numeric" autoComplete="off" value={formatPriceInput(categoryForm.defaultPrice)} onChange={(event) => setCategoryForm({ ...categoryForm, defaultPrice: toRawPriceDigits(event.target.value) })} onBeforeInput={(event) => { if (event.data && /\D/.test(event.data)) event.preventDefault(); }} onPaste={(event) => { if (/\D/.test(event.clipboardData.getData("text"))) event.preventDefault(); }} placeholder="VD: 10000" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" /></label>
              <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Tiền tệ</span><input required value={categoryForm.currency} onChange={(event) => setCategoryForm({ ...categoryForm, currency: event.target.value.toUpperCase() })} placeholder="VND" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" /></label>
              <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Thứ tự hiển thị</span><input required type="number" min={0} step={1} value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} placeholder="VD: 1" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" /></label>
              <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Trạng thái</span><select required value={categoryForm.status} onChange={(event) => setCategoryForm({ ...categoryForm, status: event.target.value as HotelServiceStatus })} className="w-full cursor-pointer rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]"><option value="ACTIVE">Active</option><option value="DISABLED">Inactive</option></select></label>
              <label className="space-y-2 md:col-span-2"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Mô tả</span><textarea value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} placeholder="Mô tả nhóm dịch vụ" className="min-h-24 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" /></label>
            </div>
            <section className="mt-4 rounded-lg border border-[var(--outline-variant)] p-4">
              <h3 className="text-sm font-semibold text-[var(--primary)]">Tùy chọn đa ngôn ngữ</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {catalogLocales.map(({ key, label }) => (
                  <button key={key} type="button" title={label} aria-label={label} onClick={() => setCategoryForm({ ...categoryForm, activeLocale: key })} className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase transition ${categoryForm.activeLocale === key ? "bg-[var(--primary)] text-[var(--on-primary)]" : "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:text-[var(--primary)]"}`}>{key}</button>
                ))}
              </div>
              {categoryForm.activeLocale === "vi" ? <p className="mt-3 text-xs text-[var(--on-surface-variant)]">Tiếng Việt dùng các trường Tên nhóm dịch vụ và Mô tả ở trên.</p> : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input value={categoryForm.translations[categoryForm.activeLocale as TranslationLocale].name} onChange={(event) => setCategoryForm({ ...categoryForm, translations: { ...categoryForm.translations, [categoryForm.activeLocale]: { ...categoryForm.translations[categoryForm.activeLocale as TranslationLocale], name: event.target.value } } })} placeholder={`Tên (${categoryForm.activeLocale})`} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" />
                  <textarea value={categoryForm.translations[categoryForm.activeLocale as TranslationLocale].description} onChange={(event) => setCategoryForm({ ...categoryForm, translations: { ...categoryForm.translations, [categoryForm.activeLocale]: { ...categoryForm.translations[categoryForm.activeLocale as TranslationLocale], description: event.target.value } } })} placeholder={`Mô tả (${categoryForm.activeLocale})`} className="min-h-20 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)] md:col-span-2" />
                </div>
              )}
            </section>
            {categoryForm.id ? <fieldset className="mt-4 rounded-lg border border-[var(--outline-variant)] p-4"><legend className="px-1 text-sm font-semibold text-[var(--primary)]">Phạm vi cập nhật giá</legend><div className="mt-2 space-y-2"><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="priceUpdateMode" checked={categoryForm.priceUpdateMode === "CATEGORY_ONLY"} onChange={() => setCategoryForm({ ...categoryForm, priceUpdateMode: "CATEGORY_ONLY" })} />Chỉ cập nhật giá mặc định nhóm</label><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="priceUpdateMode" checked={categoryForm.priceUpdateMode === "OVERRIDE_ALL_ITEMS"} onChange={selectOverrideAllItemsMode} />Đồng bộ giá cho toàn bộ dịch vụ trong nhóm</label></div></fieldset> : null}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCategoryForm(null)} className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--surface-container-low)]">Hủy</button><button disabled={isSaving} className="cursor-pointer rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[color:rgba(0,0,60,0.88)] disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Đang lưu..." : "Lưu"}</button></div>
          </form>
        </div>
      ) : null}

      {itemForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <form onSubmit={saveItem} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-5 text-2xl font-semibold text-[var(--primary)]">{itemForm.id ? "Sửa dịch vụ" : "Tạo dịch vụ"}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Tên dịch vụ</span>
                <input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} placeholder="VD: Bàn chải đánh răng" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Nhóm dịch vụ</span>
                <select required value={itemForm.categoryId} onChange={(event) => setItemForm({ ...itemForm, categoryId: event.target.value })} className="w-full cursor-pointer rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]"><option value="">Chọn nhóm</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Trạng thái</span>
                <select value={itemForm.status} onChange={(event) => setItemForm({ ...itemForm, status: event.target.value as HotelServiceStatus })} className="w-full cursor-pointer rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]">{hotelServiceStatuses.map((status) => <option key={status} value={status}>{serviceStatusLabelMap[status]}</option>)}</select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Giá riêng</span>
                <input type="text" inputMode="numeric" autoComplete="off" value={formatPriceInput(itemForm.priceOverride)} onChange={(event) => setItemForm({ ...itemForm, priceOverride: toRawPriceDigits(event.target.value) })} onBeforeInput={(event) => { if (event.data && /\D/.test(event.data)) event.preventDefault(); }} onPaste={(event) => { if (/\D/.test(event.clipboardData.getData("text"))) event.preventDefault(); }} placeholder="VD: 10000" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" />
              </label>
              <p className="text-xs text-[var(--on-surface-variant)] md:col-span-2">Để trống giá riêng để sử dụng giá mặc định của nhóm dịch vụ.</p>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--outline-variant)] p-3 md:col-span-2">
                <input type="checkbox" checked={itemForm.quantityEnabled} onChange={(event) => setItemForm({ ...itemForm, quantityEnabled: event.target.checked })} className="size-4 accent-[var(--primary)]" />
                <span>
                  <span className="block text-sm font-semibold text-[var(--primary)]">Yêu cầu khách chọn số lượng</span>
                  <span className="block text-xs text-[var(--on-surface-variant)]">Bật khi dịch vụ cần số lượng như khăn, nước uống, bàn chải.</span>
                </span>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Số lượng tối thiểu</span>
                <input type="number" min={1} step={1} disabled={!itemForm.quantityEnabled} value={itemForm.minQuantity} onChange={(event) => setItemForm({ ...itemForm, minQuantity: event.target.value })} placeholder="VD: 1" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:bg-[var(--surface-container-low)] disabled:text-[var(--on-surface-variant)]" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Số lượng tối đa</span>
                <input type="number" min={1} step={1} disabled={!itemForm.quantityEnabled} value={itemForm.maxQuantity} onChange={(event) => setItemForm({ ...itemForm, maxQuantity: event.target.value })} placeholder="Để trống nếu không giới hạn" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:bg-[var(--surface-container-low)] disabled:text-[var(--on-surface-variant)]" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Thứ tự hiển thị</span>
                <input type="number" min={0} step={1} value={itemForm.sortOrder} onChange={(event) => setItemForm({ ...itemForm, sortOrder: event.target.value })} placeholder="VD: 13" className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Mô tả</span>
                <textarea value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} placeholder="Mô tả dịch vụ" className="min-h-24 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" />
              </label>
            </div>
            <section className="mt-4 rounded-lg border border-[var(--outline-variant)] p-4">
              <h3 className="text-sm font-semibold text-[var(--primary)]">Tùy chọn đa ngôn ngữ</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {catalogLocales.map(({ key, label }) => (
                  <button key={key} type="button" title={label} aria-label={label} onClick={() => setItemForm({ ...itemForm, activeLocale: key })} className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase transition ${itemForm.activeLocale === key ? "bg-[var(--primary)] text-[var(--on-primary)]" : "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:text-[var(--primary)]"}`}>{key}</button>
                ))}
              </div>
              {itemForm.activeLocale === "vi" ? <p className="mt-3 text-xs text-[var(--on-surface-variant)]">Tiếng Việt dùng các trường Tên dịch vụ và Mô tả ở trên.</p> : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input value={itemForm.translations[itemForm.activeLocale as TranslationLocale].name} onChange={(event) => setItemForm({ ...itemForm, translations: { ...itemForm.translations, [itemForm.activeLocale]: { ...itemForm.translations[itemForm.activeLocale as TranslationLocale], name: event.target.value } } })} placeholder={`Tên (${itemForm.activeLocale})`} className="w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)]" />
                  <textarea value={itemForm.translations[itemForm.activeLocale as TranslationLocale].description} onChange={(event) => setItemForm({ ...itemForm, translations: { ...itemForm.translations, [itemForm.activeLocale]: { ...itemForm.translations[itemForm.activeLocale as TranslationLocale], description: event.target.value } } })} placeholder={`Mô tả (${itemForm.activeLocale})`} className="min-h-20 w-full rounded-lg border border-[var(--outline-variant)] px-3 py-2 outline-none focus:border-[var(--primary)] md:col-span-2" />
                </div>
              )}
            </section>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setItemForm(null)} className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--surface-container-low)]">Hủy</button><button disabled={isSaving} className="cursor-pointer rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[color:rgba(0,0,60,0.88)] disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Đang lưu..." : "Lưu"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
