"use client";

import { Fragment, useMemo, useState, type FormEvent } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showConfirmDialog, showSuccessAlert } from "@/libs/swal";
import type { RevenueBook, RevenueBookEntry } from "../types/revenue-book-contract";
import { RevenueBookDialog } from "./revenue-book-dialog";
import {
  revenueButtonClass,
  revenueInputClass,
  revenuePrimaryClass,
} from "./revenue-entry-dialog";
import {
  EMPTY_CUSTOM_COLUMNS,
  useRevenueBookCustomStore,
  type CustomRevenueColumn,
} from "../store/revenue-book-custom-store";
import {
  addMoney,
  buildActivities,
  declarationLabels,
  localParts,
  type Activity,
} from "../utils/revenue-book-export";

function money(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "VND" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatVNDInput(value: string | number): string {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function parseVNDInput(formatted: string): number {
  const digits = formatted.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function dateLabel(value: string): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

const COMMON_SUGGESTIONS = [
  "Doanh thu Minibar / Nước uống",
  "Thuê xe máy",
  "Tour / Đưa đón",
  "Bữa sáng",
  "Phụ thu nhận phòng sớm",
  "Phụ thu trả phòng muộn",
  "Bán hàng lưu niệm",
];

interface RevenueBookSpreadsheetProps {
  book: RevenueBook;
  currency: string;
  filter: string;
  canManage: boolean;
  onSelectEntry: (id: string) => void;
  onAddQuickMinibar?: (entry: RevenueBookEntry, date: string) => void;
  onCollect?: (entry: RevenueBookEntry) => void;
  onEdit?: (entry: RevenueBookEntry) => void;
}

type DayGroup = {
  date: string;
  activities: Activity[];
  subtotal: {
    roomRevenue: number;
    minibarRevenue: number;
    laundryRevenue: number;
    otherRevenue: number;
    customSums: Record<string, number>;
    revenueTotal: number;
    cash: number;
    bank: number;
    otherPayment: number;
    paidTotal: number;
    closingBalance: number;
  };
};

export function RevenueBookSpreadsheet({
  book,
  currency,
  filter,
  canManage,
  onSelectEntry,
}: RevenueBookSpreadsheetProps) {
  // Built-in column toggles
  const [visibleColumns, setVisibleColumns] = useState({
    docNumber: true,
    minibar: true,
    laundry: true,
    otherRevenue: true,
    otherPayment: true,
    declaration: false, // Mặc định ẩn vì là thông tin tạm trú công an BCA, không phải kế toán doanh thu
  });

  // Custom columns and cell values store
  const customColumns = useRevenueBookCustomStore(
    (s) => s.columnsByHotel[book.hotelId] ?? EMPTY_CUSTOM_COLUMNS,
  );
  const valuesByCell = useRevenueBookCustomStore((s) => s.valuesByCell);
  const notesByRow = useRevenueBookCustomStore((s) => s.notesByRow);
  const addColumn = useRevenueBookCustomStore((s) => s.addColumn);
  const renameColumn = useRevenueBookCustomStore((s) => s.renameColumn);
  const removeColumn = useRevenueBookCustomStore((s) => s.removeColumn);
  const setCellValue = useRevenueBookCustomStore((s) => s.setCellValue);
  const setNote = useRevenueBookCustomStore((s) => s.setNote);

  // Modal states
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnError, setColumnError] = useState("");
  const [editingColumn, setEditingColumn] = useState<CustomRevenueColumn | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Cell editing state
  const [activeCell, setActiveCell] = useState<{
    type: "revenue" | "note";
    columnId: string;
    rowKey: string;
  } | null>(null);
  const [tempCellInput, setTempCellInput] = useState("");

  const allActivities = useMemo(() => buildActivities(book), [book]);

  const filteredActivities = useMemo(() => {
    if (!filter.trim()) return allActivities;
    const lower = filter.trim().toLocaleLowerCase("vi");
    return allActivities.filter((act) => {
      const text = `${act.entry.description} ${act.entry.roomNumber ?? ""} ${act.entry.documentNumber ?? ""} ${act.date}`.toLocaleLowerCase("vi");
      return text.includes(lower);
    });
  }, [allActivities, filter]);

  // Compute day groups with custom column integration and dynamic calculation
  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    let currentGroup: DayGroup | null = null;

    for (const act of filteredActivities) {
      if (!currentGroup || currentGroup.date !== act.date) {
        const initialCustomSums: Record<string, number> = {};
        for (const col of customColumns) {
          initialCustomSums[col.id] = 0;
        }

        currentGroup = {
          date: act.date,
          activities: [],
          subtotal: {
            roomRevenue: 0,
            minibarRevenue: 0,
            laundryRevenue: 0,
            otherRevenue: 0,
            customSums: initialCustomSums,
            revenueTotal: 0,
            cash: 0,
            bank: 0,
            otherPayment: 0,
            paidTotal: 0,
            closingBalance: 0,
          },
        };
        groups.push(currentGroup);
      }
      currentGroup.activities.push(act);

      const rowKey = `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`;

      // Base revenues from API
      const baseRoom = act.revenue?.roomRevenue ?? 0;
      const baseMinibar = act.revenue?.minibarRevenue ?? 0;
      const baseLaundry = act.revenue?.laundryRevenue ?? 0;
      const baseOther = act.revenue?.otherRevenue ?? 0;
      const baseRevTotal = act.revenue?.revenueTotal ?? 0;

      // Effective revenues (overridden if receptionist edited cell)
      const roomVal = valuesByCell[`${book.hotelId}:room:${rowKey}`] ?? baseRoom;
      const minibarVal = valuesByCell[`${book.hotelId}:minibar:${rowKey}`] ?? baseMinibar;
      const laundryVal = valuesByCell[`${book.hotelId}:laundry:${rowKey}`] ?? baseLaundry;
      const otherVal = valuesByCell[`${book.hotelId}:other:${rowKey}`] ?? baseOther;

      // Custom column sums
      let customRowTotal = 0;
      for (const col of customColumns) {
        const cellKey = `${book.hotelId}:${col.id}:${rowKey}`;
        const val = valuesByCell[cellKey] ?? 0;
        currentGroup.subtotal.customSums[col.id] = addMoney(
          currentGroup.subtotal.customSums[col.id] ?? 0,
          val,
        );
        customRowTotal = addMoney(customRowTotal, val);
      }

      // Row total revenue
      const rowRevTotal = addMoney(
        addMoney(addMoney(roomVal, minibarVal), addMoney(laundryVal, otherVal)),
        customRowTotal,
      );

      // Payments
      const paid = act.collection?.amount ?? 0;
      const cash = act.collection?.method === "CASH" ? paid : 0;
      const bank = act.collection?.method === "BANK_TRANSFER" ? paid : 0;
      const other =
        act.collection &&
        act.collection.method !== "CASH" &&
        act.collection.method !== "BANK_TRANSFER"
          ? paid
          : 0;

      // Delta revenue compared to original database revenue
      const deltaRevenue = addMoney(rowRevTotal, -baseRevTotal);
      const rowClosing = act.closing !== undefined ? addMoney(act.closing, deltaRevenue) : undefined;

      // Accumulate into group subtotal
      currentGroup.subtotal.roomRevenue = addMoney(currentGroup.subtotal.roomRevenue, roomVal);
      currentGroup.subtotal.minibarRevenue = addMoney(currentGroup.subtotal.minibarRevenue, minibarVal);
      currentGroup.subtotal.laundryRevenue = addMoney(currentGroup.subtotal.laundryRevenue, laundryVal);
      currentGroup.subtotal.otherRevenue = addMoney(currentGroup.subtotal.otherRevenue, otherVal);
      currentGroup.subtotal.revenueTotal = addMoney(currentGroup.subtotal.revenueTotal, rowRevTotal);

      currentGroup.subtotal.cash = addMoney(currentGroup.subtotal.cash, cash);
      currentGroup.subtotal.bank = addMoney(currentGroup.subtotal.bank, bank);
      currentGroup.subtotal.otherPayment = addMoney(currentGroup.subtotal.otherPayment, other);
      currentGroup.subtotal.paidTotal = addMoney(currentGroup.subtotal.paidTotal, paid);

      if (rowClosing !== undefined) {
        currentGroup.subtotal.closingBalance = addMoney(
          currentGroup.subtotal.closingBalance,
          rowClosing,
        );
      }
    }
    return groups;
  }, [filteredActivities, customColumns, valuesByCell, book.hotelId]);

  // Grand totals across all days and custom columns
  const grandTotals = useMemo(() => {
    let roomRevenue = 0;
    let minibarRevenue = 0;
    let laundryRevenue = 0;
    let otherRevenue = 0;
    let revenueTotal = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    let paidTotal = 0;
    let otherPaidTotal = 0;
    const customSums: Record<string, number> = {};
    for (const col of customColumns) {
      customSums[col.id] = 0;
    }

    for (const group of dayGroups) {
      roomRevenue = addMoney(roomRevenue, group.subtotal.roomRevenue);
      minibarRevenue = addMoney(minibarRevenue, group.subtotal.minibarRevenue);
      laundryRevenue = addMoney(laundryRevenue, group.subtotal.laundryRevenue);
      otherRevenue = addMoney(otherRevenue, group.subtotal.otherRevenue);
      revenueTotal = addMoney(revenueTotal, group.subtotal.revenueTotal);
      cashTotal = addMoney(cashTotal, group.subtotal.cash);
      bankTotal = addMoney(bankTotal, group.subtotal.bank);
      paidTotal = addMoney(paidTotal, group.subtotal.paidTotal);
      otherPaidTotal = addMoney(otherPaidTotal, group.subtotal.otherPayment);
      for (const col of customColumns) {
        customSums[col.id] = addMoney(customSums[col.id], group.subtotal.customSums[col.id] ?? 0);
      }
    }

    const grandClosingBalance = addMoney(
      addMoney(book.summary.openingBalance, book.summary.balanceAdjustment),
      addMoney(revenueTotal, -paidTotal),
    );

    return {
      roomRevenue,
      minibarRevenue,
      laundryRevenue,
      otherRevenue,
      customSums,
      revenueTotal,
      cashTotal,
      bankTotal,
      paidTotal,
      otherPaidTotal,
      closingBalance: grandClosingBalance,
    };
  }, [dayGroups, customColumns, book.summary.openingBalance, book.summary.balanceAdjustment]);

  // Column Spans
  const revenueColSpan =
    1 + // Doanh thu Tiền phòng
    (visibleColumns.minibar ? 1 : 0) +
    (visibleColumns.laundry ? 1 : 0) +
    (visibleColumns.otherRevenue ? 1 : 0) +
    customColumns.length +
    1; // Tổng doanh thu hằng ngày

  const totalCols =
    3 + // TT, Ngày/Tháng, Số phòng
    (visibleColumns.docNumber ? 1 : 0) +
    1 + // Diễn giải
    revenueColSpan +
    4 + // Ngày thanh toán, Tiền mặt, Giờ CK, Số tiền
    1 + // Tổng tiền thanh toán
    (visibleColumns.otherPayment ? 1 : 0) +
    1 + // Còn nợ
    (visibleColumns.declaration ? 1 : 0) +
    1; // Ghi chú

  // Submit add column
  function handleAddColumnSubmit(event: FormEvent) {
    event.preventDefault();
    if (!newColumnName.trim()) {
      setColumnError("Vui lòng nhập tên cột doanh thu.");
      return;
    }
    setColumnError("");
    const addedId = addColumn(book.hotelId, newColumnName.trim());
    setIsAddingColumn(false);
    setNewColumnName("");
    void showSuccessAlert(
      "Đã thêm cột mới",
      `Cột "${newColumnName.trim()}" đã được thêm vào bảng tính. Bạn có thể click trực tiếp vào ô tương ứng để nhập số tiền.`,
    );
  }

  // Handle rename column
  function handleRenameSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editingColumn || !renameValue.trim()) return;
    renameColumn(book.hotelId, editingColumn.id, renameValue.trim());
    setEditingColumn(null);
    setRenameValue("");
    void showSuccessAlert("Đã đổi tên cột", "Tên cột mới đã được cập nhật.");
  }

  // Handle remove column
  async function handleRemoveColumn(col: CustomRevenueColumn) {
    const confirmation = await showConfirmDialog({
      title: "Xóa cột doanh thu",
      confirmText: "Xóa cột",
      cancelText: "Giữ lại",
      confirmVariant: "danger",
      details: [
        { label: "Tên cột", value: col.name },
        {
          label: "Lưu ý",
          value: "Toàn bộ số tiền đã nhập trong cột này sẽ được xóa khỏi bảng tính.",
        },
      ],
    });
    if (!confirmation.isConfirmed) return;
    removeColumn(book.hotelId, col.id);
    setEditingColumn(null);
    void showSuccessAlert("Đã xóa cột", `Cột "${col.name}" đã được gỡ bỏ.`);
  }

  // Cell editing commit handlers
  function startEditingRevenue(columnId: string, rowKey: string, currentVal: number) {
    if (!canManage) return;
    setActiveCell({ type: "revenue", columnId, rowKey });
    setTempCellInput(currentVal > 0 ? formatVNDInput(currentVal) : "");
  }

  function commitRevenueCell(columnId: string, rowKey: string, baseVal: number) {
    const trimmed = tempCellInput.trim();
    if (trimmed === "") {
      setCellValue(book.hotelId, columnId, rowKey, null);
    } else {
      const num = Math.max(0, parseVNDInput(trimmed));
      if (
        num === baseVal &&
        (columnId === "room" ||
          columnId === "minibar" ||
          columnId === "laundry" ||
          columnId === "other")
      ) {
        setCellValue(book.hotelId, columnId, rowKey, null);
      } else {
        setCellValue(book.hotelId, columnId, rowKey, num);
      }
    }
    setActiveCell(null);
  }

  function startEditingNote(rowKey: string, currentNote: string) {
    if (!canManage) return;
    setActiveCell({ type: "note", columnId: "note", rowKey });
    setTempCellInput(currentNote);
  }

  function commitNoteCell(rowKey: string) {
    setNote(book.hotelId, rowKey, tempCellInput);
    setActiveCell(null);
  }

  // Editable cell renderers
  function renderEditableRevenueCell(
    columnId: string,
    rowKey: string,
    baseVal: number,
    currentVal: number,
    bgClass = "",
  ) {
    const isEditing =
      activeCell?.type === "revenue" &&
      activeCell?.columnId === columnId &&
      activeCell?.rowKey === rowKey;
    const isOverridden = valuesByCell[`${book.hotelId}:${columnId}:${rowKey}`] !== undefined;

    if (isEditing) {
      return (
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={tempCellInput}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTempCellInput(formatVNDInput(e.target.value))}
          onBlur={() => commitRevenueCell(columnId, rowKey, baseVal)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRevenueCell(columnId, rowKey, baseVal);
            if (e.key === "Escape") setActiveCell(null);
          }}
          placeholder="0"
          className="w-full min-w-[85px] rounded border border-sky-500 bg-white px-1.5 py-0.5 text-right text-xs font-bold text-slate-900 shadow-xs outline-none ring-2 ring-sky-200 tabular-nums"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEditingRevenue(columnId, rowKey, currentVal)}
        className={`group w-full rounded px-1.5 py-0.5 text-right text-xs transition-colors focus-visible:outline-none ${bgClass} ${
          canManage ? "hover:bg-sky-100/70 cursor-pointer" : "cursor-default"
        }`}
        title={
          canManage
            ? isOverridden
              ? "Số tiền đã tùy chỉnh. Click để sửa (xóa trắng để về giá gốc)."
              : "Click để nhập hoặc sửa số tiền."
            : undefined
        }
      >
        {currentVal > 0 ? (
          <span
            className={`tabular-nums ${
              isOverridden
                ? "font-bold text-sky-800 underline decoration-sky-400 decoration-dotted underline-offset-2"
                : "font-medium text-slate-800"
            }`}
          >
            {money(currentVal, currency)}
          </span>
        ) : (
          <span className="text-slate-300 group-hover:text-sky-600 font-normal">
            —
          </span>
        )}
      </button>
    );
  }

  function renderEditableNoteCell(rowKey: string, baseNote: string, currentNote: string) {
    const isEditing = activeCell?.type === "note" && activeCell?.rowKey === rowKey;
    const isOverridden = notesByRow[`${book.hotelId}:${rowKey}`] !== undefined;

    if (isEditing) {
      return (
        <input
          type="text"
          autoFocus
          value={tempCellInput}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTempCellInput(e.target.value)}
          onBlur={() => commitNoteCell(rowKey)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitNoteCell(rowKey);
            if (e.key === "Escape") setActiveCell(null);
          }}
          placeholder="Nhập ghi chú..."
          className="w-full min-w-[140px] rounded border border-amber-500 bg-white px-1.5 py-0.5 text-xs text-slate-900 shadow-xs outline-none ring-2 ring-amber-300"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEditingNote(rowKey, currentNote)}
        className={`group w-full rounded px-1.5 py-0.5 text-left text-xs transition-colors focus-visible:outline-none ${
          canManage ? "hover:bg-amber-100/60 cursor-pointer" : "cursor-default"
        }`}
        title={canManage ? "Click để sửa ghi chú cho dòng này" : undefined}
      >
        {currentNote ? (
          <span
            className={`block truncate max-w-xs ${
              isOverridden ? "font-medium text-amber-950 italic" : "text-slate-600"
            }`}
            title={currentNote}
          >
            {currentNote}
          </span>
        ) : (
          <span className="text-slate-300 group-hover:text-amber-700 font-normal">
            —
          </span>
        )}
      </button>
    );
  }

  // Manual save confirmation
  async function handleManualSave() {
    await showSuccessAlert(
      "Đã lưu sổ doanh thu",
      "Toàn bộ các cột tự thêm, số tiền và ghi chú đã nhập được lưu an toàn trên hệ thống.",
    );
  }

  let runningSequence = 0;

  return (
    <div className="space-y-3">
      {/* Dynamic Column Toggles & Add Column Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide">
            Cột doanh thu:
          </span>

          {/* Add Custom Column Button */}
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setNewColumnName("");
                setColumnError("");
                setIsAddingColumn(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-sky-500 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors shadow-xs cursor-pointer"
              title="Thêm một cột doanh thu mới do bạn tự đặt tên"
            >
              <VsIcon name="add_circle" className="text-base text-sky-600" />
              <span>+ Thêm cột mới</span>
            </button>
          )}

          {/* Custom Columns Pills with management */}
          {customColumns.map((col) => (
            <div
              key={col.id}
              className="inline-flex items-center gap-1 rounded-xl border border-sky-300 bg-sky-100/80 px-2.5 py-1 text-xs font-medium text-sky-950 shadow-xs"
            >
              <span>{col.name}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingColumn(col);
                    setRenameValue(col.name);
                  }}
                  className="rounded p-0.5 text-sky-700 hover:bg-sky-200 focus-visible:outline-none cursor-pointer"
                  title="Đổi tên hoặc xóa cột này"
                  aria-label={`Quản lý cột ${col.name}`}
                >
                  <VsIcon name="settings" className="text-xs" />
                </button>
              )}
            </div>
          ))}

          {/* Built-in system columns */}
          <button
            type="button"
            onClick={() => setVisibleColumns((p) => ({ ...p, minibar: !p.minibar }))}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              visibleColumns.minibar
                ? "bg-sky-50 text-sky-800 border border-sky-200 shadow-xs"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{visibleColumns.minibar ? "✓" : "+"}</span>
            <span>Minibar</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibleColumns((p) => ({ ...p, laundry: !p.laundry }))}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              visibleColumns.laundry
                ? "bg-sky-50 text-sky-800 border border-sky-200 shadow-xs"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{visibleColumns.laundry ? "✓" : "+"}</span>
            <span>Giặt ủi</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibleColumns((p) => ({ ...p, otherRevenue: !p.otherRevenue }))}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              visibleColumns.otherRevenue
                ? "bg-sky-50 text-sky-800 border border-sky-200 shadow-xs"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{visibleColumns.otherRevenue ? "✓" : "+"}</span>
            <span>Dịch vụ khác</span>
          </button>

          {/* Divider */}
          <div className="h-4 w-px bg-slate-300 mx-1" />

          <span className="text-xs font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide">
            Cột bổ trợ:
          </span>

          <button
            type="button"
            onClick={() => setVisibleColumns((p) => ({ ...p, docNumber: !p.docNumber }))}
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
              visibleColumns.docNumber
                ? "bg-slate-200 text-slate-800 border border-slate-300 shadow-xs"
                : "bg-white text-slate-400 border border-slate-200 line-through"
            }`}
            title="Bật/Tắt cột Số chứng từ"
          >
            <span>Số chứng từ</span>
          </button>

          <button
            type="button"
            onClick={() => setVisibleColumns((p) => ({ ...p, otherPayment: !p.otherPayment }))}
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
              visibleColumns.otherPayment
                ? "bg-slate-200 text-slate-800 border border-slate-300 shadow-xs"
                : "bg-white text-slate-400 border border-slate-200 line-through"
            }`}
            title="Bật/Tắt cột Thanh toán khác"
          >
            <span>TT khác</span>
          </button>

          <button
            type="button"
            onClick={() => setVisibleColumns((p) => ({ ...p, declaration: !p.declaration }))}
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
              visibleColumns.declaration
                ? "bg-amber-100 text-amber-900 border border-amber-300 font-semibold shadow-xs"
                : "bg-white text-slate-400 border border-slate-200 line-through"
            }`}
            title="Cột Khai báo tạm trú công an BCA (mặc định ẩn vì là nghiệp vụ tạm trú, không phải số liệu doanh thu)"
          >
            <span>Khai báo (BCA)</span>
          </button>
        </div>

        {/* Save button and indicator */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleManualSave()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--on-surface)] hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <VsIcon name="save" className="text-base text-emerald-600" />
            <span>Lưu bảng tính</span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Grid Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-xs max-h-[75vh]">
        <table className="w-full min-w-[1200px] border-collapse text-xs text-left">
          {/* Header 4 Tiers */}
          <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800 shadow-xs">
            {/* Tier 1 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th rowSpan={4} className="px-2 py-2 w-10 bg-slate-100">TT</th>
              <th rowSpan={4} className="px-2 py-2 w-24 bg-slate-100">Ngày/Tháng</th>
              <th rowSpan={4} className="px-2 py-2 w-20 bg-slate-100">Số phòng</th>
              {visibleColumns.docNumber && (
                <th rowSpan={4} className="px-2 py-2 w-32 bg-slate-100">Số chứng từ (Hóa đơn/Phiếu thu)</th>
              )}
              <th rowSpan={4} className="px-3 py-2 min-w-[180px] bg-slate-100">Diễn giải</th>
              <th colSpan={revenueColSpan} className="px-2 py-1.5 bg-sky-100/90 text-sky-950 font-bold border-b border-sky-300">
                Doanh thu dịch vụ
              </th>
              <th colSpan={4} className="px-2 py-1.5 bg-emerald-100/90 text-emerald-950 font-bold border-b border-emerald-300">
                Khách hàng thanh toán
              </th>
              <th rowSpan={4} className="px-2 py-2 w-28 bg-emerald-50 text-emerald-900 font-bold">Tổng thanh toán</th>
              {visibleColumns.otherPayment && (
                <th rowSpan={4} className="px-2 py-2 w-24 bg-slate-100">Thanh toán khác</th>
              )}
              <th rowSpan={4} className="px-2 py-2 w-28 bg-amber-100/70 text-amber-950 font-bold">Còn nợ</th>
              {visibleColumns.declaration && (
                <th rowSpan={4} className="px-2 py-2 w-24 bg-slate-100">Khai báo</th>
              )}
              <th rowSpan={4} className="px-2 py-2 min-w-[140px] bg-slate-100">Ghi chú</th>
            </tr>

            {/* Tier 2 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th rowSpan={3} className="px-2 py-1.5 w-24 bg-sky-50/90 text-sky-900">Tiền phòng</th>
              {visibleColumns.minibar && (
                <th rowSpan={3} className="px-2 py-1.5 w-28 bg-sky-50/90 text-sky-900">
                  Minibar / Nước uống
                </th>
              )}
              {visibleColumns.laundry && (
                <th rowSpan={3} className="px-2 py-1.5 w-24 bg-sky-50/90 text-sky-900">Giặt ủi</th>
              )}
              {visibleColumns.otherRevenue && (
                <th rowSpan={3} className="px-2 py-1.5 w-24 bg-sky-50/90 text-sky-900">Dịch vụ khác</th>
              )}

              {/* Custom User Columns in Tier 2 */}
              {customColumns.map((col) => (
                <th
                  key={col.id}
                  rowSpan={3}
                  className="px-2 py-1.5 min-w-[110px] bg-sky-100 text-sky-950 font-bold border-x border-sky-300"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate" title={col.name}>{col.name}</span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingColumn(col);
                          setRenameValue(col.name);
                        }}
                        className="rounded p-0.5 text-sky-700 hover:bg-sky-200 cursor-pointer"
                        title={`Sửa tên hoặc xóa cột ${col.name}`}
                      >
                        <VsIcon name="more_vert" className="text-xs" />
                      </button>
                    )}
                  </div>
                </th>
              ))}

              <th rowSpan={3} className="px-2 py-1.5 w-28 bg-sky-200/80 font-bold text-sky-950">
                Tổng doanh thu
              </th>
              <th rowSpan={3} className="px-2 py-1.5 w-24 bg-emerald-50/70 text-emerald-950">Ngày thanh toán</th>
              <th colSpan={3} className="px-2 py-1 bg-emerald-100/70 font-semibold border-b border-emerald-200 text-emerald-950">
                Số tiền
              </th>
            </tr>

            {/* Tier 3 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th rowSpan={2} className="px-2 py-1.5 w-24 bg-emerald-50/70 text-emerald-950">Tiền mặt</th>
              <th colSpan={2} className="px-2 py-1 bg-emerald-100/60 font-semibold border-b border-emerald-200 text-emerald-950">
                Chuyển khoản
              </th>
            </tr>

            {/* Tier 4 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th className="px-2 py-1 w-16 bg-emerald-50/50 text-emerald-950 font-mono">Giờ CK</th>
              <th className="px-2 py-1 w-24 bg-emerald-50/50 text-emerald-950 font-semibold">Số tiền</th>
            </tr>

            {/* Opening Balance Row */}
            <tr className="bg-amber-50/80 text-amber-950 font-medium border-b border-amber-200">
              <td colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1} className="px-3 py-1.5 font-semibold">
                Công nợ đầu kỳ
              </td>
              <td colSpan={revenueColSpan + 4} className="px-3 py-1.5 text-right font-normal text-amber-800">
                Số dư từ kỳ trước chuyển sang:
              </td>
              <td colSpan={visibleColumns.otherPayment ? 2 : 1} className="px-2 py-1.5 text-right font-bold tabular-nums">
                —
              </td>
              <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${book.summary.openingBalance < 0 ? "text-rose-600" : ""}`}>
                {money(book.summary.openingBalance, currency)}
              </td>
              <td colSpan={1 + (visibleColumns.declaration ? 1 : 0)} className="px-2 py-1.5 text-xs text-amber-800 text-right">
                {book.currency}
              </td>
            </tr>

            {/* Balance Adjustment Row */}
            {book.summary.balanceAdjustment !== 0 && (
              <tr className="bg-amber-50/50 text-amber-900 border-b border-amber-200 text-xs">
                <td colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1} className="px-3 py-1">
                  Điều chỉnh công nợ không qua thu tiền
                </td>
                <td colSpan={revenueColSpan + 4} className="px-3 py-1 text-right text-amber-700">
                  Phân bổ đặt cọc / cấn trừ công nợ:
                </td>
                <td colSpan={visibleColumns.otherPayment ? 2 : 1} className="px-2 py-1 text-right tabular-nums">
                  —
                </td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">
                  {money(book.summary.balanceAdjustment, currency)}
                </td>
                <td colSpan={1 + (visibleColumns.declaration ? 1 : 0)} className="px-2 py-1 text-xs text-amber-800 text-right">
                  —
                </td>
              </tr>
            )}
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 bg-white">
            {dayGroups.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center text-slate-500 text-sm">
                  {filter ? "Không có bản ghi nào phù hợp với bộ lọc." : "Chưa có phát sinh trong kỳ này."}
                </td>
              </tr>
            ) : (
              dayGroups.map((group) => {
                const sub = group.subtotal;

                return (
                  <Fragment key={`day-${group.date || "none"}`}>
                    {/* Activity Rows for this Day */}
                    {group.activities.map((act) => {
                      runningSequence++;
                      const seq = runningSequence;
                      const { entry, revenue, collection } = act;

                      const rowKey = `${entry.id}_${act.date}_${collection?.id ?? "rev"}`;

                      // Base revenues from API
                      const baseRoom = revenue?.roomRevenue ?? 0;
                      const baseMinibar = revenue?.minibarRevenue ?? 0;
                      const baseLaundry = revenue?.laundryRevenue ?? 0;
                      const baseOther = revenue?.otherRevenue ?? 0;
                      const baseRevTotal = revenue?.revenueTotal ?? 0;

                      // Overridden/effective values
                      const roomVal = valuesByCell[`${book.hotelId}:room:${rowKey}`] ?? baseRoom;
                      const minibarVal = valuesByCell[`${book.hotelId}:minibar:${rowKey}`] ?? baseMinibar;
                      const laundryVal = valuesByCell[`${book.hotelId}:laundry:${rowKey}`] ?? baseLaundry;
                      const otherVal = valuesByCell[`${book.hotelId}:other:${rowKey}`] ?? baseOther;

                      // Custom column values for this row
                      let rowCustomSum = 0;
                      const rowCustomValues: Record<string, number> = {};
                      for (const col of customColumns) {
                        const cellKey = `${book.hotelId}:${col.id}:${rowKey}`;
                        const val = valuesByCell[cellKey] ?? 0;
                        rowCustomValues[col.id] = val;
                        rowCustomSum = addMoney(rowCustomSum, val);
                      }

                      // Row total revenue
                      const finalRowRevenueTotal = addMoney(
                        addMoney(addMoney(roomVal, minibarVal), addMoney(laundryVal, otherVal)),
                        rowCustomSum,
                      );

                      // Payments
                      const paid = collection?.amount ?? 0;
                      const cash = collection?.method === "CASH" ? paid : 0;
                      const bank = collection?.method === "BANK_TRANSFER" ? paid : 0;
                      const other =
                        collection &&
                        collection.method !== "CASH" &&
                        collection.method !== "BANK_TRANSFER"
                          ? paid
                          : 0;
                      const local = collection ? localParts(collection.receivedAt, book.timeZone) : null;

                      // Delta revenue & closing balance
                      const deltaRevenue = addMoney(finalRowRevenueTotal, -baseRevTotal);
                      const finalClosing =
                        act.closing !== undefined ? addMoney(act.closing, deltaRevenue) : undefined;

                      // Note value
                      const rowNote = notesByRow[`${book.hotelId}:${rowKey}`] ?? entry.notes ?? "";

                      return (
                        <tr
                          key={`act-${entry.id}-${act.date}-${collection?.id ?? "rev"}-${seq}`}
                          className="hover:bg-sky-50/30 transition-colors divide-x divide-slate-100"
                        >
                          <td className="px-2 py-2 text-center text-slate-500 font-mono">{seq}</td>
                          <td className="px-2 py-2 whitespace-nowrap text-slate-700 font-mono">
                            {act.date ? dateLabel(act.date) : "—"}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap font-medium text-slate-900">
                            {entry.roomNumber ? `P.${entry.roomNumber}` : "—"}
                          </td>
                          {visibleColumns.docNumber && (
                            <td className="px-2 py-2 text-slate-600 font-mono">
                              {entry.documentNumber || "—"}
                            </td>
                          )}
                          <td className="px-3 py-2 font-medium">
                            <button
                              type="button"
                              onClick={() => onSelectEntry(entry.id)}
                              className="text-left text-[var(--primary)] hover:underline focus-visible:outline-none cursor-pointer"
                              title="Xem chi tiết khoản phát sinh"
                            >
                              {entry.description}
                            </button>
                            {entry.source === "MANUAL" && (
                              <span className="ml-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                                {entry.voidedAt ? "Đã hủy" : "Bổ sung"}
                              </span>
                            )}
                          </td>

                          {/* Doanh thu Tiền phòng (Inline Editable) */}
                          <td className="px-2 py-1 text-right tabular-nums text-slate-800">
                            {renderEditableRevenueCell("room", rowKey, baseRoom, roomVal)}
                          </td>

                          {/* Doanh thu Minibar (Inline Editable) */}
                          {visibleColumns.minibar && (
                            <td className="px-2 py-1 text-right tabular-nums text-slate-800">
                              {renderEditableRevenueCell("minibar", rowKey, baseMinibar, minibarVal)}
                            </td>
                          )}

                          {/* Doanh thu Giặt ủi (Inline Editable) */}
                          {visibleColumns.laundry && (
                            <td className="px-2 py-1 text-right tabular-nums text-slate-800">
                              {renderEditableRevenueCell("laundry", rowKey, baseLaundry, laundryVal)}
                            </td>
                          )}

                          {/* Doanh thu Dịch vụ khác (Inline Editable) */}
                          {visibleColumns.otherRevenue && (
                            <td className="px-2 py-1 text-right tabular-nums text-slate-800">
                              {renderEditableRevenueCell("other", rowKey, baseOther, otherVal)}
                            </td>
                          )}

                          {/* Custom Columns Cells (Inline Editable) */}
                          {customColumns.map((col) => {
                            const val = rowCustomValues[col.id] ?? 0;
                            return (
                              <td
                                key={col.id}
                                className="px-2 py-1 text-right tabular-nums bg-sky-50/40"
                              >
                                {renderEditableRevenueCell(col.id, rowKey, 0, val)}
                              </td>
                            );
                          })}

                          {/* Tổng doanh thu hằng ngày (Auto Calculated) */}
                          <td className="px-2 py-2 text-right tabular-nums font-semibold bg-sky-50/60 text-sky-950">
                            {finalRowRevenueTotal !== 0 ? money(finalRowRevenueTotal, currency) : "—"}
                          </td>

                          {/* Ngày tháng thanh toán */}
                          <td className="px-2 py-2 text-center text-slate-600 font-mono whitespace-nowrap">
                            {local ? dateLabel(local.date) : "—"}
                          </td>

                          {/* Tiền mặt */}
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {cash !== 0 ? money(cash, currency) : "—"}
                          </td>

                          {/* Giờ CK */}
                          <td className="px-2 py-2 text-center text-slate-500 font-mono text-xs">
                            {bank ? local?.time || "—" : "—"}
                          </td>

                          {/* Số tiền CK */}
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {bank !== 0 ? money(bank, currency) : "—"}
                          </td>

                          {/* Tổng tiền thanh toán */}
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-800">
                            {paid !== 0 ? money(paid, currency) : "—"}
                          </td>

                          {/* Thanh toán khác */}
                          {visibleColumns.otherPayment && (
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                              {other !== 0 ? money(other, currency) : "—"}
                            </td>
                          )}

                          {/* Còn nợ (Auto Calculated) */}
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-semibold ${
                              (finalClosing ?? 0) < 0 ? "text-rose-600" : "text-slate-900"
                            }`}
                          >
                            {finalClosing !== undefined ? money(finalClosing, currency) : "—"}
                          </td>

                          {/* Khai báo (BCA) */}
                          {visibleColumns.declaration && (
                            <td className="px-2 py-2 text-center whitespace-nowrap">
                              {entry.declarationStatus ? (
                                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                  {declarationLabels[entry.declarationStatus] ?? "Chưa xác định"}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}

                          {/* Ghi chú (Inline Editable) */}
                          <td className="px-2 py-1 text-slate-700 text-xs max-w-xs">
                            {renderEditableNoteCell(rowKey, entry.notes || "", rowNote)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Row for this Day (Cộng ngày) */}
                    {group.date && (
                      <tr className="bg-slate-100/90 font-bold border-y-2 border-slate-300 text-slate-900 divide-x divide-slate-300">
                        <td colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1} className="px-3 py-1.5 text-left text-slate-800">
                          Cộng ngày {dateLabel(group.date)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {money(sub.roomRevenue, currency)}
                        </td>
                        {visibleColumns.minibar && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.minibarRevenue, currency)}
                          </td>
                        )}
                        {visibleColumns.laundry && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.laundryRevenue, currency)}
                          </td>
                        )}
                        {visibleColumns.otherRevenue && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.otherRevenue, currency)}
                          </td>
                        )}

                        {/* Custom Columns Subtotals for this Day */}
                        {customColumns.map((col) => (
                          <td
                            key={col.id}
                            className="px-2 py-1.5 text-right tabular-nums bg-sky-100/70 text-sky-950 font-bold"
                          >
                            {money(sub.customSums[col.id] ?? 0, currency)}
                          </td>
                        ))}

                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-950 font-extrabold bg-sky-200/60">
                          {money(sub.revenueTotal, currency)}
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-400">—</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {money(sub.cash, currency)}
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-400">—</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {money(sub.bank, currency)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-emerald-900 font-extrabold">
                          {money(sub.paidTotal, currency)}
                        </td>
                        {visibleColumns.otherPayment && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.otherPayment, currency)}
                          </td>
                        )}
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums font-extrabold ${
                            sub.closingBalance < 0 ? "text-rose-600" : ""
                          }`}
                        >
                          {money(sub.closingBalance, currency)}
                        </td>
                        {visibleColumns.declaration && (
                          <td className="px-2 py-1.5 text-center text-slate-400">—</td>
                        )}
                        <td className="px-2 py-1.5 text-slate-500 font-normal text-right text-xs">
                          Tổng ngày {dateLabel(group.date)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}

            {/* Grand Total Row (TỔNG KỲ) */}
            <tr className="bg-slate-200 font-bold border-t-2 border-slate-400 text-slate-950 divide-x divide-slate-300 text-sm">
              <td colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1} className="px-3 py-2.5 text-left uppercase tracking-wider font-extrabold">
                TỔNG KỲ
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {money(grandTotals.roomRevenue, currency)}
              </td>
              {visibleColumns.minibar && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.minibarRevenue, currency)}
                </td>
              )}
              {visibleColumns.laundry && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.laundryRevenue, currency)}
                </td>
              )}
              {visibleColumns.otherRevenue && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.otherRevenue, currency)}
                </td>
              )}

              {/* Custom Columns Grand Total */}
              {customColumns.map((col) => (
                <td
                  key={col.id}
                  className="px-2 py-2.5 text-right tabular-nums bg-sky-200 text-sky-950 font-black"
                >
                  {money(grandTotals.customSums[col.id] ?? 0, currency)}
                </td>
              ))}

              <td className="px-2 py-2.5 text-right tabular-nums font-black bg-sky-300/80 text-sky-950">
                {money(grandTotals.revenueTotal, currency)}
              </td>
              <td className="px-2 py-2.5 text-center text-slate-400 font-normal">—</td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {money(grandTotals.cashTotal, currency)}
              </td>
              <td className="px-2 py-2.5 text-center text-slate-400 font-normal">—</td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {money(grandTotals.bankTotal, currency)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums font-black text-emerald-950">
                {money(grandTotals.paidTotal, currency)}
              </td>
              {visibleColumns.otherPayment && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.otherPaidTotal, currency)}
                </td>
              )}
              <td
                className={`px-2 py-2.5 text-right tabular-nums font-black ${
                  grandTotals.closingBalance < 0 ? "text-rose-600" : "text-slate-950"
                }`}
              >
                {money(grandTotals.closingBalance, currency)}
              </td>
              {visibleColumns.declaration && (
                <td className="px-2 py-2.5 text-center text-slate-400 font-normal">—</td>
              )}
              <td className="px-2 py-2.5 text-right text-xs text-slate-600 font-normal">
                {book.currency}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Add Custom Column Modal (Box Ngang Centered) */}
      {isAddingColumn && (
        <RevenueBookDialog
          title="Thêm cột doanh thu tùy chỉnh"
          onClose={() => setIsAddingColumn(false)}
        >
          <form onSubmit={handleAddColumnSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="block text-sm font-semibold text-slate-900">
                Tên cột doanh thu mới
              </span>
              <input
                type="text"
                required
                autoFocus
                placeholder="VD: Doanh thu Minibar / Nước uống, Thuê xe máy..."
                value={newColumnName}
                onChange={(e) => {
                  setNewColumnName(e.target.value);
                  setColumnError("");
                }}
                className={revenueInputClass}
              />
              {columnError && (
                <p className="text-xs text-red-600">{columnError}</p>
              )}
            </label>

            {/* Suggestions */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">
                Hoặc chọn nhanh gợi ý phổ biến:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setNewColumnName(item)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 transition-colors"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            <footer className="flex justify-end gap-2 border-t border-[var(--outline-variant)] pt-4">
              <button
                type="button"
                onClick={() => setIsAddingColumn(false)}
                className={revenueButtonClass}
              >
                Hủy
              </button>
              <button type="submit" className={revenuePrimaryClass}>
                Thêm cột vào bảng tính
              </button>
            </footer>
          </form>
        </RevenueBookDialog>
      )}

      {/* Edit Column Modal (Box Ngang Centered) */}
      {editingColumn && (
        <RevenueBookDialog
          title={`Quản lý cột: ${editingColumn.name}`}
          onClose={() => setEditingColumn(null)}
        >
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="block text-sm font-semibold text-slate-900">
                Đổi tên cột
              </span>
              <input
                type="text"
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className={revenueInputClass}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--outline-variant)] pt-4">
              <button
                type="button"
                onClick={() => void handleRemoveColumn(editingColumn)}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
              >
                Xóa cột này khỏi bảng tính
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingColumn(null)}
                  className={revenueButtonClass}
                >
                  Hủy
                </button>
                <button type="submit" className={revenuePrimaryClass}>
                  Lưu tên mới
                </button>
              </div>
            </div>
          </form>
        </RevenueBookDialog>
      )}
    </div>
  );
}
