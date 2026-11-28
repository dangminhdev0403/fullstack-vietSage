"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Temporal } from "@js-temporal/polyfill";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { formatMoney } from "@/features/billing/utils/money";
import { generateExpenseIdempotencyKey } from "@/features/billing/utils/idempotency";
import { useHotelExpenses } from "@/features/billing/hooks/use-hotel-expenses";
import {
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_PAYMENT_METHOD_OPTIONS,
  EXPENSE_PAYMENT_STATUS_LABELS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type HotelExpenseItem,
  type HotelExpensesQuery,
} from "@/features/billing/types/hotel-expenses-contract";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";

type HotelExpensesClientProps = {
  hotelId: string;
};

function currentMonthBounds(): { from: string; to: string } {
  const today = Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh");
  return {
    from: today.with({ day: 1 }).toString(),
    to: today.with({ day: today.daysInMonth }).toString(),
  };
}

function previousMonthBounds(): { from: string; to: string } {
  const prev = Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh")
    .toPlainYearMonth()
    .subtract({ months: 1 });
  return {
    from: prev.toPlainDate({ day: 1 }).toString(),
    to: prev.toPlainDate({ day: prev.daysInMonth }).toString(),
  };
}

function formatYmdVi(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

type ExpenseFormState = {
  expenseDate: string;
  category: ExpenseCategory;
  title: string;
  vendorName: string;
  roomId: string;
  amount: string;
  paidAmount: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod: ExpensePaymentMethod;
  paymentAccount: string;
  documentNumber: string;
  notes: string;
};

function buildInitialForm(item?: HotelExpenseItem | null): ExpenseFormState {
  const today = Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString();
  if (!item) {
    return {
      expenseDate: today,
      category: "SUPPLIES",
      title: "",
      vendorName: "",
      roomId: "",
      amount: "",
      paidAmount: "",
      paymentStatus: "PAID",
      paymentMethod: "BANK_TRANSFER",
      paymentAccount: "",
      documentNumber: "",
      notes: "",
    };
  }
  return {
    expenseDate: item.expenseDate,
    category: item.category,
    title: item.title,
    vendorName: item.vendorName ?? "",
    roomId: item.roomId ?? "",
    amount: String(item.amount),
    paidAmount: String(item.paidAmount),
    paymentStatus: item.paymentStatus,
    paymentMethod: item.paymentMethod ?? "BANK_TRANSFER",
    paymentAccount: item.paymentAccount ?? "",
    documentNumber: item.documentNumber ?? "",
    notes: item.notes ?? "",
  };
}

export function HotelExpensesClient({ hotelId }: HotelExpensesClientProps) {
  const router = useRouter();
  const initialBounds = useMemo(() => currentMonthBounds(), []);
  const [from, setFrom] = useState(initialBounds.from);
  const [to, setTo] = useState(initialBounds.to);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<ExpensePaymentStatus | "">("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "expenseDate", desc: true },
  ]);

  const queryInput: HotelExpensesQuery = useMemo(
    () => ({
      from,
      to,
      category: categoryFilter || undefined,
      paymentStatus: statusFilter || undefined,
      includeVoided,
    }),
    [from, to, categoryFilter, statusFilter, includeVoided],
  );

  const { query, create, update, pay, voidExpense } = useHotelExpenses(hotelId, queryInput);
  const data = query.data;
  const currency = data?.currency || "VND";

  const [editingItem, setEditingItem] = useState<HotelExpenseItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(() => buildInitialForm(null));

  const [payingItem, setPayingItem] = useState<HotelExpenseItem | null>(null);
  const [payAmountInput, setPayAmountInput] = useState("");
  const [payMarkFull, setPayMarkFull] = useState(true);
  const [payMethodInput, setPayMethodInput] = useState<ExpensePaymentMethod>("BANK_TRANSFER");
  const [payAccountInput, setPayAccountInput] = useState("");
  const [payDateInput, setPayDateInput] = useState(() =>
    Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString(),
  );
  const [payIdempotencyKey, setPayIdempotencyKey] = useState("");

  const [formUnknownAccount, setFormUnknownAccount] = useState(false);
  const [formSalt, setFormSalt] = useState("");
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null);

  const [payUnknownAccount, setPayUnknownAccount] = useState(false);
  const [paySubmitError, setPaySubmitError] = useState<string | null>(null);

  const [voidingItem, setVoidingItem] = useState<HotelExpenseItem | null>(null);
  const [voidReason, setVoidReason] = useState("");

  function openCreateModal() {
    setEditingItem(null);
    setForm(buildInitialForm(null));
    setFormUnknownAccount(false);
    setFormSalt("");
    setFormSubmitError(null);
    setIsFormOpen(true);
  }

  function openEditModal(item: HotelExpenseItem) {
    setEditingItem(item);
    setForm(buildInitialForm(item));
    setFormUnknownAccount(!item.paymentAccount);
    setFormSalt("");
    setFormSubmitError(null);
    setIsFormOpen(true);
  }

  function openPayModal(item: HotelExpenseItem) {
    setPayingItem(item);
    setPayMarkFull(true);
    setPayAmountInput(String(item.unpaidAmount));
    setPayMethodInput(item.paymentMethod ?? "BANK_TRANSFER");
    setPayAccountInput(item.paymentAccount ?? "");
    setPayUnknownAccount(!item.paymentAccount);
    setPayDateInput(Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString());
    setPaySubmitError(null);
    setPayIdempotencyKey(
      generateExpenseIdempotencyKey({
        hotelId,
        expenseDate: Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString(),
        category: item.category,
        title: `pay-${item.id}`,
        amount: item.unpaidAmount,
        paymentStatus: "PAID",
        paymentMethod: item.paymentMethod ?? "BANK_TRANSFER",
        paymentAccount: item.paymentAccount ?? null,
      }),
    );
  }

  const computedCreateIdempotencyKey = useMemo(() => {
    const numericAmount = Number(form.amount) || 0;
    const numericPaid = form.paymentStatus === "PARTIAL" ? Number(form.paidAmount) : undefined;
    return generateExpenseIdempotencyKey({
      hotelId,
      expenseDate: form.expenseDate,
      category: form.category,
      title: form.title.trim(),
      amount: numericAmount,
      paidAmount: numericPaid,
      paymentStatus: form.paymentStatus,
      paymentMethod: form.paymentStatus === "UNPAID" ? null : form.paymentMethod,
      paymentAccount:
        form.paymentStatus === "UNPAID"
          ? null
          : formUnknownAccount
            ? null
            : form.paymentAccount.trim() || null,
      salt: formSalt || undefined,
    });
  }, [
    hotelId,
    form.expenseDate,
    form.category,
    form.title,
    form.amount,
    form.paidAmount,
    form.paymentStatus,
    form.paymentMethod,
    form.paymentAccount,
    formUnknownAccount,
    formSalt,
  ]);

  async function handleSaveExpense(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setFormSubmitError(null);
    const numericAmount = Number(form.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      await showErrorAlert("Số tiền không hợp lệ", "Vui lòng nhập số tiền chi phí lớn hơn 0.");
      return;
    }
    const numericPaid =
      form.paymentStatus === "PARTIAL" ? Number(form.paidAmount) : undefined;
    if (
      form.paymentStatus === "PARTIAL" &&
      (!Number.isFinite(numericPaid) || (numericPaid ?? 0) <= 0 || (numericPaid ?? 0) >= numericAmount)
    ) {
      await showErrorAlert(
        "Số tiền đã trả chưa đúng",
        "Thanh toán một phần cần số tiền đã trả lớn hơn 0 và nhỏ hơn tổng chi phí.",
      );
      return;
    }

    const effectivePaymentAccount =
      form.paymentStatus === "UNPAID"
        ? null
        : formUnknownAccount
          ? null
          : form.paymentAccount.trim() || null;

    const payload = {
      expenseDate: form.expenseDate,
      category: form.category,
      title: form.title.trim(),
      vendorName: form.vendorName.trim() || null,
      roomId: form.roomId || null,
      amount: numericAmount,
      paidAmount: numericPaid,
      paymentStatus: form.paymentStatus,
      paymentMethod: form.paymentStatus === "UNPAID" ? null : form.paymentMethod,
      paymentAccount: effectivePaymentAccount,
      documentNumber: form.documentNumber.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingItem) {
        await update.mutateAsync({
          expenseId: editingItem.id,
          body: { ...payload, version: editingItem.version },
        });
        setIsFormOpen(false);
        await showSuccessAlert("Đã cập nhật khoản chi", "Số liệu chi phí và lãi/lỗ đã được đồng bộ.");
      } else {
        await create.mutateAsync({
          ...payload,
          idempotencyKey: computedCreateIdempotencyKey,
        });
        setIsFormOpen(false);
        await showSuccessAlert("Đã ghi nhận khoản chi", "Khoản chi mới đã được đưa vào sổ chi phí.");
      }
      router.refresh();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Đã có lỗi xảy ra khi lưu khoản chi.";
      setFormSubmitError(msg);
      await showErrorAlert("Không thể lưu khoản chi", error);
    }
  }

  async function handleConfirmPay(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!payingItem) return;
    setPaySubmitError(null);
    const numericPay = Number(payAmountInput);
    if (!payMarkFull && (!Number.isFinite(numericPay) || numericPay <= 0)) {
      await showErrorAlert("Số tiền thanh toán chưa hợp lệ", "Vui lòng nhập số tiền lớn hơn 0.");
      return;
    }

    const effectivePayAccount = payUnknownAccount
      ? null
      : payAccountInput.trim() || null;

    const stablePayKey =
      payIdempotencyKey ||
      generateExpenseIdempotencyKey({
        hotelId,
        expenseDate: payDateInput,
        category: payingItem.category,
        title: `pay-${payingItem.id}`,
        amount: payMarkFull ? payingItem.unpaidAmount : numericPay,
        paymentStatus: payMarkFull ? "PAID" : "PARTIAL",
        paymentMethod: payMethodInput,
        paymentAccount: effectivePayAccount,
      });

    try {
      await pay.mutateAsync({
        expenseId: payingItem.id,
        body: {
          version: payingItem.version,
          markFull: payMarkFull,
          payAmount: payMarkFull ? undefined : numericPay,
          paymentMethod: payMethodInput,
          paymentAccount: effectivePayAccount,
          paidAt: payDateInput ? `${payDateInput}T12:00:00+07:00` : null,
          idempotencyKey: stablePayKey,
        },
      });
      setPayingItem(null);
      await showSuccessAlert("Đã thanh toán khoản chi", "Công nợ chi phí đã được cập nhật.");
      router.refresh();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Đã có lỗi xảy ra khi thanh toán khoản chi.";
      setPaySubmitError(msg);
      await showErrorAlert("Không thể thanh toán khoản chi", error);
    }
  }

  async function handleConfirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidingItem) return;
    const trimmedReason = voidReason.trim();
    if (trimmedReason.length < 2) {
      await showErrorAlert("Thiếu lý do hủy", "Vui lòng nhập lý do hủy khoản chi tối thiểu 2 ký tự.");
      return;
    }
    const confirmed = await showConfirmDialog({
      title: "Xác nhận hủy khoản chi?",
      text: `Khoản "${voidingItem.title}" sẽ bị loại khỏi tổng chi phí và báo cáo lãi/lỗ.`,
      confirmText: "Xác nhận hủy",
      cancelText: "Giữ lại",
      confirmVariant: "danger",
    });
    if (!confirmed.isConfirmed) return;

    try {
      await voidExpense.mutateAsync({
        expenseId: voidingItem.id,
        body: { version: voidingItem.version, reason: trimmedReason },
      });
      setVoidingItem(null);
      setVoidReason("");
      await showSuccessAlert("Đã hủy khoản chi", "Khoản chi đã được đánh dấu hủy.");
      router.refresh();
    } catch (error) {
      await showErrorAlert("Không thể hủy khoản chi", error);
    }
  }

  const columns = useMemo<ColumnDef<HotelExpenseItem>[]>(
    () => [
      {
        accessorKey: "expenseDate",
        header: () => <span className="whitespace-nowrap">Ngày chi</span>,
        cell: ({ row }) => (
          <span className="font-semibold text-slate-900 whitespace-nowrap tabular-nums dark:text-white">
            {formatYmdVi(row.original.expenseDate)}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: () => <span>Khoản chi &amp; Phân loại</span>,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="min-w-[180px] max-w-xs space-y-1">
              <div className="font-bold text-slate-900 truncate dark:text-white">
                {item.title}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap dark:bg-slate-800 dark:text-slate-300">
                  {item.categoryLabel}
                </span>
                {item.roomNumber ? (
                  <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 whitespace-nowrap dark:bg-blue-950/60 dark:text-blue-300">
                    P.{item.roomNumber}
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "vendorName",
        header: () => <span className="whitespace-nowrap">Nhà cung cấp</span>,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-slate-700 whitespace-nowrap dark:text-slate-300">
            {row.original.vendorName || "—"}
          </span>
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: () => <span className="whitespace-nowrap">Trạng thái</span>,
        cell: ({ row }) => {
          const item = row.original;
          if (item.voidedAt) {
            return (
              <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-600 whitespace-nowrap dark:bg-slate-800 dark:text-slate-400">
                Đã hủy
              </span>
            );
          }
          const badgeClass =
            item.paymentStatus === "PAID"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
              : item.paymentStatus === "PARTIAL"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300";
          return (
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${badgeClass}`}>
              {EXPENSE_PAYMENT_STATUS_LABELS[item.paymentStatus]}
            </span>
          );
        },
      },
      {
        accessorKey: "paymentAccount",
        header: () => <span className="whitespace-nowrap">Tài khoản chi</span>,
        cell: ({ row }) => {
          const item = row.original;
          if (item.voidedAt || item.paymentStatus === "UNPAID") {
            return <span className="text-xs text-slate-400 font-medium whitespace-nowrap">—</span>;
          }
          if (item.paymentAccount) {
            return (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800 whitespace-nowrap dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <VsIcon name="account_balance" className="text-xs text-slate-500" />
                <span>{item.paymentAccount}</span>
              </span>
            );
          }
          return (
            <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300">
              Chưa phân bổ TK (Legacy)
            </span>
          );
        },
      },
      {
        accessorKey: "amount",
        header: () => <div className="text-right whitespace-nowrap">Số tiền</div>,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-right tabular-nums whitespace-nowrap">
              <div className={`font-extrabold ${item.voidedAt ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
                {formatMoney(item.amount, currency)}
              </div>
              {!item.voidedAt && item.unpaidAmount > 0 && item.paidAmount > 0 ? (
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Còn nợ {formatMoney(item.unpaidAmount, currency)}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right whitespace-nowrap">Thao tác</div>,
        cell: ({ row }) => {
          const item = row.original;
          if (item.voidedAt) {
            return <div className="text-right text-xs text-slate-400 whitespace-nowrap">Đã lưu trữ</div>;
          }
          return (
            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
              {item.unpaidAmount > 0 ? (
                <button
                  type="button"
                  onClick={() => openPayModal(item)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap cursor-pointer"
                >
                  Thanh toán
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => openEditModal(item)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Chi tiết
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoidingItem(item);
                  setVoidReason("");
                }}
                className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 whitespace-nowrap cursor-pointer dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
              >
                Hủy
              </button>
            </div>
          );
        },
      },
    ],
    [currency],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const summary = data?.summary;
  const activeCategories = useMemo(
    () => (data?.byCategory ?? []).filter((c) => c.amount > 0),
    [data?.byCategory],
  );

  return (
    <div className="space-y-6">
      {/* Header & KPI Strip */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 text-balance dark:text-white">
              Kiểm soát chi phí vận hành
            </h2>
            <p className="text-sm text-slate-600 text-pretty dark:text-slate-400">
              Ghi nhận khoản chi lương, điện nước, vật tư, hoa hồng OTA và theo dõi công nợ phải trả theo thời gian thực.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 whitespace-nowrap cursor-pointer"
          >
            <VsIcon name="add" className="text-lg" />
            <span>Ghi khoản chi mới</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Tổng chi phí (gồm SaaS)
            </div>
            <div className="mt-1.5 text-2xl font-black text-rose-700 tabular-nums dark:text-rose-400">
              {formatMoney(summary?.totalWithSaas ?? 0, currency)}
            </div>
            <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Vận hành {formatMoney(summary?.totalExpense ?? 0, currency)} · {summary?.entryCount ?? 0} phiếu chi
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Đã thanh toán thực chi
            </div>
            <div className="mt-1.5 text-2xl font-black text-emerald-800 tabular-nums dark:text-emerald-400">
              {formatMoney(summary?.paidExpense ?? 0, currency)}
            </div>
            <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Dòng tiền đã chi ra trong kỳ
            </div>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Công nợ chi chưa trả
            </div>
            <div className="mt-1.5 text-2xl font-black text-amber-800 tabular-nums dark:text-amber-400">
              {formatMoney(summary?.unpaidExpense ?? 0, currency)}
            </div>
            <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              {summary?.unpaidCount ?? 0} khoản chưa tất toán
            </div>
          </div>

          <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Phí VietSage SaaS kỳ này
            </div>
            <div className="mt-1.5 text-2xl font-black text-blue-800 tabular-nums dark:text-blue-400">
              {formatMoney(summary?.saasFeeInPeriod ?? 0, currency)}
            </div>
            <div className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              Tự động tổng hợp từ phí phòng/ngày
            </div>
          </div>
        </div>

        {/* Category breakdown bar */}
        {activeCategories.length > 0 ? (
          <div className="mt-5 grid gap-2.5 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
            {activeCategories.map((cat) => (
              <div
                key={cat.category}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
                  {cat.categoryLabel}
                </span>
                <span className="font-bold text-slate-900 tabular-nums whitespace-nowrap dark:text-white">
                  {formatMoney(cat.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Filters & Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 p-4 md:p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const b = currentMonthBounds();
                setFrom(b.from);
                setTo(b.to);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Tháng này
            </button>
            <button
              type="button"
              onClick={() => {
                const b = previousMonthBounds();
                setFrom(b.from);
                setTo(b.to);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Tháng trước
            </button>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Từ ngày"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="text-sm font-bold text-slate-400">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Đến ngày"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | "")}
              aria-label="Lọc theo danh mục chi"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Tất cả danh mục</option>
              {EXPENSE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExpensePaymentStatus | "")}
              aria-label="Lọc theo trạng thái thanh toán"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PAID">Đã thanh toán</option>
              <option value="PARTIAL">Thanh toán một phần</option>
              <option value="UNPAID">Chưa thanh toán</option>
            </select>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeVoided}
                onChange={(e) => setIncludeVoided(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-700"
              />
              <span className="whitespace-nowrap">Hiện phiếu đã hủy</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:text-base">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3.5 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {query.isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                    Đang tải sổ chi phí vận hành...
                  </td>
                </tr>
              ) : query.isError ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm font-semibold text-rose-600">
                    {(query.error as Error)?.message || "Không thể tải danh sách chi phí."}
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                    Chưa có khoản chi phí nào trong kỳ đã chọn. Bấm &ldquo;Ghi khoản chi mới&rdquo; để bắt đầu hạch toán.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openEditModal(row.original)}
                    className="cursor-pointer transition-colors hover:bg-emerald-50/40 dark:hover:bg-slate-800/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Centered Horizontal Modal: Create / Edit Expense */}
      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 text-balance dark:text-white">
                  {editingItem ? "Chi tiết & cập nhật khoản chi phí" : "Ghi nhận khoản chi phí mới"}
                </h3>
                <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
                  Mọi khoản chi hợp lệ sẽ tự động khấu trừ vào báo cáo Lãi/Lỗ của khách sạn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:text-slate-300"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Ngày phát sinh *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.expenseDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Danh mục chi phí *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, category: e.target.value as ExpenseCategory }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {EXPENSE_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Nội dung / Khoản chi *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={240}
                    placeholder="VD: Thanh toán tiền điện EVN tháng 11, Bảo trì điều hòa P.204"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Tổng số tiền (VND) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1000"
                    required
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Nhà cung cấp / Người nhận
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    placeholder="VD: EVN, Giặt ủi Sao Mai, Đội lễ tân"
                    value={form.vendorName}
                    onChange={(e) => setForm((prev) => ({ ...prev, vendorName: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Trạng thái thanh toán
                  </label>
                  <select
                    value={form.paymentStatus}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        paymentStatus: e.target.value as ExpensePaymentStatus,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="PAID">Đã thanh toán đủ</option>
                    <option value="PARTIAL">Thanh toán một phần</option>
                    <option value="UNPAID">Chưa thanh toán (Công nợ chi)</option>
                  </select>
                </div>

                {form.paymentStatus === "PARTIAL" ? (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                      Số tiền đã trả *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1000"
                      required
                      value={form.paidAmount}
                      onChange={(e) => setForm((prev) => ({ ...prev, paidAmount: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                      Hình thức thanh toán
                    </label>
                    <select
                      disabled={form.paymentStatus === "UNPAID"}
                      value={form.paymentMethod}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value as ExpensePaymentMethod,
                        }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {EXPENSE_PAYMENT_METHOD_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {form.paymentStatus !== "UNPAID" ? (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                      Tài khoản trích tiền chi (tùy chọn)
                    </label>
                    <input
                      type="text"
                      placeholder={
                        form.paymentMethod === "CASH"
                          ? "VD: Két tiền mặt lễ tân (để trống nếu chưa xác định)"
                          : "VD: Ngân hàng / số tài khoản chi (để trống nếu chưa xác định)"
                      }
                      value={form.paymentAccount}
                      onChange={(e) => setForm((prev) => ({ ...prev, paymentAccount: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-medium">Chọn nhanh:</span>
                      {(form.paymentMethod === "CASH"
                        ? ["Két tiền mặt lễ tân", "Quỹ tiền mặt khách sạn"]
                        : ["Vietcombank", "Techcombank", "ACB", "BIDV"]
                      ).map((acc) => (
                        <button
                          key={acc}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, paymentAccount: acc }))}
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                            form.paymentAccount === acc
                              ? "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {acc}
                        </button>
                      ))}
                      {form.paymentAccount ? (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, paymentAccount: "" }))}
                          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Để chưa xác định
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Gắn theo phòng (nếu chi riêng)
                  </label>
                  <select
                    value={form.roomId}
                    onChange={(e) => setForm((prev) => ({ ...prev, roomId: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Chi phí chung toàn khách sạn</option>
                    {(data?.rooms ?? []).map((room) => (
                      <option key={room.id} value={room.id}>
                        Phòng {room.roomNumber}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Số chứng từ / Hóa đơn
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="VD: PC-2026-041"
                    value={form.documentNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, documentNumber: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Ghi chú kế toán
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Idempotency Key Indicator */}
              {!editingItem && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 flex items-center justify-between text-xs text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                  <div className="flex items-center gap-1.5 truncate">
                    <VsIcon name="lock" className="text-sm shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-600 dark:text-slate-300">Khóa chống trùng:</span>
                    <code className="font-mono text-slate-700 truncate dark:text-slate-300">{computedCreateIdempotencyKey}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormSalt(Math.random().toString(36).slice(2, 7))}
                    title="Tạo mã muối mới cho khoản chi"
                    className="text-emerald-700 hover:underline font-bold whitespace-nowrap ml-2 cursor-pointer dark:text-emerald-400"
                  >
                    Làm mới
                  </button>
                </div>
              )}

              {/* Error / Retry Controls Banner */}
              {formSubmitError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-2 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-bold">
                    <VsIcon name="error" className="text-base text-rose-600 shrink-0" />
                    <span>Không thể lưu khoản chi: {formSubmitError}</span>
                  </div>
                  <p className="text-slate-600 text-pretty dark:text-slate-400">
                    Khoản chi chưa được ghi nhận. Bạn có thể thử lại an toàn với cùng khóa chống trùng lặp, hoặc tạo mã giao dịch mới.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveExpense()}
                      disabled={create.isPending || update.isPending}
                      className="rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
                    >
                      Thử lại với cùng khóa chống trùng
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormSalt(Math.random().toString(36).slice(2, 7));
                        setFormSubmitError(null);
                      }}
                      className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold px-3 py-1.5 text-xs cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Tạo mã giao dịch mới
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || update.isPending}
                  className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {create.isPending || update.isPending
                    ? "Đang lưu..."
                    : editingItem
                      ? "Lưu thay đổi"
                      : "Lưu khoản chi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Centered Horizontal Modal: Settle / Pay Unpaid Expense */}
      {payingItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-xl font-extrabold text-slate-900 text-balance dark:text-white">
              Thanh toán công nợ khoản chi
            </h3>
            <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
              {payingItem.title} — Còn phải trả{" "}
              <strong className="text-amber-700 dark:text-amber-400">
                {formatMoney(payingItem.unpaidAmount, currency)}
              </strong>
            </p>

            <form onSubmit={handleConfirmPay} className="mt-5 space-y-4">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={payMarkFull}
                  onChange={(e) => setPayMarkFull(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                />
                <span>Tất toán toàn bộ số dư ({formatMoney(payingItem.unpaidAmount, currency)})</span>
              </label>

              {!payMarkFull ? (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Số tiền thanh toán đợt này *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={payingItem.unpaidAmount}
                    step="1000"
                    required
                    value={payAmountInput}
                    onChange={(e) => setPayAmountInput(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Phương thức thanh toán
                  </label>
                  <select
                    value={payMethodInput}
                    onChange={(e) => {
                      const next = e.target.value as ExpensePaymentMethod;
                      setPayMethodInput(next);
                      if (next === "CASH" && ["Vietcombank", "Techcombank", "ACB", "BIDV"].includes(payAccountInput)) {
                        setPayAccountInput("");
                      }
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {EXPENSE_PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Ngày thực chi
                  </label>
                  <input
                    type="date"
                    value={payDateInput}
                    onChange={(e) => setPayDateInput(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                  Tài khoản trích tiền chi (tùy chọn)
                </label>
                <input
                  type="text"
                  value={payAccountInput}
                  onChange={(e) => setPayAccountInput(e.target.value)}
                  placeholder={
                    payMethodInput === "CASH"
                      ? "VD: Két tiền mặt lễ tân (để trống nếu chưa xác định)"
                      : "VD: Ngân hàng / số tài khoản chi (để trống nếu chưa xác định)"
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400 font-medium">Chọn nhanh:</span>
                  {(payMethodInput === "CASH"
                    ? ["Két tiền mặt lễ tân", "Quỹ tiền mặt khách sạn"]
                    : ["Vietcombank", "Techcombank", "ACB", "BIDV"]
                  ).map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => setPayAccountInput(acc)}
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                        payAccountInput === acc
                          ? "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {acc}
                    </button>
                  ))}
                  {payAccountInput ? (
                    <button
                      type="button"
                      onClick={() => setPayAccountInput("")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Để chưa xác định
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Error / Retry Banner */}
              {paySubmitError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-2 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-bold">
                    <VsIcon name="error" className="text-base text-rose-600 shrink-0" />
                    <span>Không thể hoàn tất thanh toán: {paySubmitError}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleConfirmPay()}
                      disabled={pay.isPending}
                      className="rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
                    >
                      Thử lại thanh toán
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayingItem(null)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={pay.isPending}
                  className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {pay.isPending ? "Đang xử lý..." : "Xác nhận thanh toán"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Centered Horizontal Modal: Void Expense with Reason */}
      {voidingItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-xl font-extrabold text-slate-900 text-balance dark:text-white">
              Hủy khoản chi phí
            </h3>
            <p className="mt-1 text-sm text-slate-600 text-pretty dark:text-slate-400">
              Nhập lý do hủy cho khoản <strong>{voidingItem.title}</strong> ({formatMoney(voidingItem.amount, currency)}).
            </p>
            <form onSubmit={handleConfirmVoid} className="mt-4 space-y-4">
              <textarea
                rows={3}
                required
                minLength={2}
                maxLength={500}
                placeholder="VD: Nhập trùng chứng từ PC-012"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setVoidingItem(null)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={voidExpense.isPending}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {voidExpense.isPending ? "Đang hủy..." : "Tiếp tục hủy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
