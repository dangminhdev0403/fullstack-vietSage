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
  EMPTY_DELETED_ROWS,
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
  "Đưa đón sân bay",
  "Thuê xe máy",
  "Tour du lịch",
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
  onCollect?: (entry: RevenueBookEntry) => void;
  onEdit?: (entry: RevenueBookEntry) => void;
}

type DayGroup = {
  date: string;
  activities: Activity[];
  subtotal: {
    roomRevenue: number;
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
  // Built-in column toggles (Không có minibar vì VietSage không dùng cột minibar cố định)
  const [visibleColumns, setVisibleColumns] = useState({
    docNumber: true,
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
  const descriptionsByRow = useRevenueBookCustomStore((s) => s.descriptionsByRow);
  const textOverrides = useRevenueBookCustomStore((s) => s.textOverrides);
  const addColumn = useRevenueBookCustomStore((s) => s.addColumn);
  const renameColumn = useRevenueBookCustomStore((s) => s.renameColumn);
  const removeColumn = useRevenueBookCustomStore((s) => s.removeColumn);
  const removeAllColumns = useRevenueBookCustomStore((s) => s.removeAllColumns);
  const setCellValue = useRevenueBookCustomStore((s) => s.setCellValue);
  const setNote = useRevenueBookCustomStore((s) => s.setNote);
  const setDescription = useRevenueBookCustomStore((s) => s.setDescription);
  const setTextOverride = useRevenueBookCustomStore((s) => s.setTextOverride);
  const deletedRowKeys = useRevenueBookCustomStore(
    (s) => s.deletedRowsByHotel[book.hotelId] ?? EMPTY_DELETED_ROWS,
  );
  const deleteRow = useRevenueBookCustomStore((s) => s.deleteRow);
  const deleteRows = useRevenueBookCustomStore((s) => s.deleteRows);
  const restoreRow = useRevenueBookCustomStore((s) => s.restoreRow);
  const restoreAllRows = useRevenueBookCustomStore((s) => s.restoreAllRows);
  const clearAllCustomValues = useRevenueBookCustomStore((s) => s.clearAllCustomValues);
  const clearAllCustomDescriptions = useRevenueBookCustomStore(
    (s) => s.clearAllCustomDescriptions,
  );
  const clearAllCustomNotes = useRevenueBookCustomStore((s) => s.clearAllCustomNotes);

  // Modal states
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnError, setColumnError] = useState("");
  const [editingColumn, setEditingColumn] = useState<CustomRevenueColumn | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Data management modal states
  const [isManagingData, setIsManagingData] = useState(false);
  const [dataManageTab, setDataManageTab] = useState<"rows" | "deleted" | "reset">("rows");
  const [selectedRowKeysToDelete, setSelectedRowKeysToDelete] = useState<string[]>([]);

  // Cell editing state
  const [activeCell, setActiveCell] = useState<{
    type: "money" | "text" | "description" | "note";
    columnId: string;
    rowKey: string;
  } | null>(null);
  const [tempCellInput, setTempCellInput] = useState("");

  const allActivities = useMemo(() => buildActivities(book), [book]);

  const activeActivities = useMemo(() => {
    if (deletedRowKeys.length === 0) return allActivities;
    return allActivities.filter((act) => {
      const rowKey = `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`;
      return !deletedRowKeys.includes(rowKey);
    });
  }, [allActivities, deletedRowKeys]);

  const deletedActivities = useMemo(() => {
    if (deletedRowKeys.length === 0) return [];
    return allActivities.filter((act) => {
      const rowKey = `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`;
      return deletedRowKeys.includes(rowKey);
    });
  }, [allActivities, deletedRowKeys]);

  const filteredActivities = useMemo(() => {
    if (!filter.trim()) return activeActivities;
    const lower = filter.trim().toLocaleLowerCase("vi");
    return activeActivities.filter((act) => {
      const { entry, collection } = act;
      const rowKey = `${entry.id}_${act.date}_${collection?.id ?? "rev"}`;
      const effectiveDescription =
        descriptionsByRow[`${book.hotelId}:${rowKey}`] ?? entry.description;
      const text = `${effectiveDescription} ${entry.roomNumber ?? ""} ${entry.documentNumber ?? ""} ${act.date}`.toLocaleLowerCase("vi");
      return text.includes(lower);
    });
  }, [activeActivities, filter, descriptionsByRow, book.hotelId]);

  // Table row selection state for rapid direct deletion
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // Detect test / audit rows in active activities
  const auditRowKeys = useMemo(() => {
    return activeActivities
      .filter((act) => {
        const rowKey = `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`;
        const desc = descriptionsByRow[`${book.hotelId}:${rowKey}`] ?? act.entry.description;
        const note = notesByRow[`${book.hotelId}:${rowKey}`] ?? act.entry.notes ?? "";
        const combined = `${desc} ${note}`.toLowerCase();
        return (
          combined.includes("audit") ||
          combined.includes("thử nghiệm") ||
          combined.includes("test")
        );
      })
      .map((act) => `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`);
  }, [activeActivities, descriptionsByRow, notesByRow, book.hotelId]);

  // Count active overrides
  const customValuesCount = useMemo(() => {
    const prefix = `${book.hotelId}:`;
    return Object.keys(valuesByCell).filter((k) => k.startsWith(prefix)).length;
  }, [valuesByCell, book.hotelId]);

  const customDescCount = useMemo(() => {
    const prefix = `${book.hotelId}:`;
    return Object.keys(descriptionsByRow).filter((k) => k.startsWith(prefix)).length;
  }, [descriptionsByRow, book.hotelId]);

  const customNotesCount = useMemo(() => {
    const prefix = `${book.hotelId}:`;
    return Object.keys(notesByRow).filter((k) => k.startsWith(prefix)).length;
  }, [notesByRow, book.hotelId]);

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
      const baseLaundry = act.revenue?.laundryRevenue ?? 0;
      const baseOther = act.revenue?.otherRevenue ?? 0;
      const baseRevTotal = act.revenue?.revenueTotal ?? 0;

      // Effective revenues (overridden if receptionist edited cell)
      const roomVal = valuesByCell[`${book.hotelId}:room:${rowKey}`] ?? baseRoom;
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

      // Row total revenue (AUTO TÍNH TOÁN)
      const rowRevTotal = addMoney(
        addMoney(roomVal, laundryVal),
        addMoney(otherVal, customRowTotal),
      );

      // Base payments from API
      const basePaid = act.collection?.amount ?? 0;
      const baseCash = act.collection?.method === "CASH" ? basePaid : 0;
      const baseBank = act.collection?.method === "BANK_TRANSFER" ? basePaid : 0;
      const baseOtherPayment =
        act.collection &&
        act.collection.method !== "CASH" &&
        act.collection.method !== "BANK_TRANSFER"
          ? basePaid
          : 0;

      // Effective payments (overridden if receptionist edited cell)
      const cashVal = valuesByCell[`${book.hotelId}:cash:${rowKey}`] ?? baseCash;
      const bankVal = valuesByCell[`${book.hotelId}:bank:${rowKey}`] ?? baseBank;
      const otherPaymentVal =
        valuesByCell[`${book.hotelId}:otherPayment:${rowKey}`] ?? baseOtherPayment;

      // Row total payment (AUTO TÍNH TOÁN)
      const rowPaidTotal = addMoney(addMoney(cashVal, bankVal), otherPaymentVal);

      // Delta revenue & delta payment compared to original database revenue
      const deltaRevenue = addMoney(rowRevTotal, -baseRevTotal);
      const deltaPaid = addMoney(rowPaidTotal, -basePaid);
      const deltaNet = addMoney(deltaRevenue, -deltaPaid);
      const rowClosing =
        act.closing !== undefined ? addMoney(act.closing, deltaNet) : undefined;

      // Accumulate into group subtotal
      currentGroup.subtotal.roomRevenue = addMoney(currentGroup.subtotal.roomRevenue, roomVal);
      currentGroup.subtotal.laundryRevenue = addMoney(currentGroup.subtotal.laundryRevenue, laundryVal);
      currentGroup.subtotal.otherRevenue = addMoney(currentGroup.subtotal.otherRevenue, otherVal);
      currentGroup.subtotal.revenueTotal = addMoney(currentGroup.subtotal.revenueTotal, rowRevTotal);

      currentGroup.subtotal.cash = addMoney(currentGroup.subtotal.cash, cashVal);
      currentGroup.subtotal.bank = addMoney(currentGroup.subtotal.bank, bankVal);
      currentGroup.subtotal.otherPayment = addMoney(currentGroup.subtotal.otherPayment, otherPaymentVal);
      currentGroup.subtotal.paidTotal = addMoney(currentGroup.subtotal.paidTotal, rowPaidTotal);

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
      title: "Xóa cứng cột doanh thu",
      confirmText: "Xóa vĩnh viễn",
      cancelText: "Giữ lại",
      confirmVariant: "danger",
      details: [
        { label: "Tên cột", value: col.name },
        {
          label: "Lưu ý",
          value:
            "Cột này cùng toàn bộ số tiền đã nhập trong cột sẽ được xóa vĩnh viễn khỏi bảng tính và báo cáo.",
        },
      ],
    });
    if (!confirmation.isConfirmed) return;
    removeColumn(book.hotelId, col.id);
    setEditingColumn(null);
    void showSuccessAlert("Đã xóa cứng cột", `Cột "${col.name}" đã được xóa hoàn toàn khỏi sổ.`);
  }

  // Handle remove all custom columns
  async function handleRemoveAllCustomColumns() {
    const count = customColumns.length;
    if (count === 0) return;
    const confirmation = await showConfirmDialog({
      title: `Xóa cứng tất cả ${count} cột doanh thu đã thêm`,
      confirmText: `Xóa vĩnh viễn cả ${count} cột`,
      cancelText: "Hủy",
      confirmVariant: "danger",
      details: [
        { label: "Số lượng", value: `${count} cột tự thêm` },
        {
          label: "Lưu ý quan trọng",
          value:
            "Toàn bộ các cột và toàn bộ số tiền đã nhập trong các cột này sẽ bị xóa sạch khỏi bảng tính.",
        },
      ],
    });
    if (!confirmation.isConfirmed) return;
    removeAllColumns(book.hotelId);
    setEditingColumn(null);
    void showSuccessAlert(
      "Đã xóa sạch cột tự thêm",
      `Đã xóa vĩnh viễn ${count} cột doanh thu tự thêm khỏi sổ.`,
    );
  }

  // Cell editing commit handlers
  function startEditingMoney(columnId: string, rowKey: string, currentVal: number) {
    if (!canManage) return;
    setActiveCell({ type: "money", columnId, rowKey });
    setTempCellInput(currentVal > 0 ? formatVNDInput(currentVal) : "");
  }

  function commitMoneyCell(columnId: string, rowKey: string, baseVal: number) {
    const trimmed = tempCellInput.trim();
    if (trimmed === "") {
      setCellValue(book.hotelId, columnId, rowKey, null);
    } else {
      const num = Math.max(0, parseVNDInput(trimmed));
      if (
        num === baseVal &&
        (columnId === "room" ||
          columnId === "laundry" ||
          columnId === "other" ||
          columnId === "cash" ||
          columnId === "bank" ||
          columnId === "otherPayment")
      ) {
        setCellValue(book.hotelId, columnId, rowKey, null);
      } else {
        setCellValue(book.hotelId, columnId, rowKey, num);
      }
    }
    setActiveCell(null);
  }

  function startEditingText(field: string, rowKey: string, currentVal: string) {
    if (!canManage) return;
    setActiveCell({ type: "text", columnId: field, rowKey });
    setTempCellInput(currentVal);
  }

  function commitTextCell(field: string, rowKey: string, baseVal: string) {
    const trimmed = tempCellInput.trim();
    if (trimmed === "" || trimmed === baseVal) {
      setTextOverride(book.hotelId, field, rowKey, "");
    } else {
      setTextOverride(book.hotelId, field, rowKey, trimmed);
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

  function startEditingDescription(rowKey: string, currentDescription: string) {
    if (!canManage) return;
    setActiveCell({ type: "description", columnId: "description", rowKey });
    setTempCellInput(currentDescription);
  }

  function commitDescriptionCell(rowKey: string, baseDescription: string) {
    const trimmed = tempCellInput.trim();
    if (trimmed === "" || trimmed === baseDescription) {
      setDescription(book.hotelId, rowKey, "");
    } else {
      setDescription(book.hotelId, rowKey, trimmed);
    }
    setActiveCell(null);
  }

  async function handleDeleteRow(rowKey: string, description: string) {
    if (!canManage) return;
    const confirmation = await showConfirmDialog({
      title: "Xóa dòng khỏi sổ doanh thu",
      confirmText: "Xóa dòng",
      cancelText: "Giữ lại",
      confirmVariant: "danger",
      details: [
        { label: "Nội dung", value: description },
        {
          label: "Lưu ý",
          value:
            "Dòng này sẽ được loại bỏ khỏi bảng tính và số liệu tổng kỳ. Bạn có thể khôi phục lại bất kỳ lúc nào tại mục 'Xóa / Dọn data'.",
        },
      ],
    });
    if (!confirmation.isConfirmed) return;
    deleteRow(book.hotelId, rowKey);
    void showSuccessAlert(
      "Đã xóa dòng",
      `Dòng "${description}" đã được loại khỏi bảng tính.`,
    );
  }

  // Editable money cell renderer (Dùng cho cả Doanh thu và Thanh toán)
  function renderEditableMoneyCell({
    columnId,
    rowKey,
    baseVal,
    currentVal,
    theme = "sky",
  }: {
    columnId: string;
    rowKey: string;
    baseVal: number;
    currentVal: number;
    theme?: "sky" | "emerald";
  }) {
    const isEditing =
      activeCell?.type === "money" &&
      activeCell?.columnId === columnId &&
      activeCell?.rowKey === rowKey;
    const isOverridden = valuesByCell[`${book.hotelId}:${columnId}:${rowKey}`] !== undefined;

    const ringClass =
      theme === "emerald"
        ? "border-emerald-500 ring-2 ring-emerald-200"
        : "border-sky-500 ring-2 ring-sky-200";
    const hoverClass =
      theme === "emerald" ? "hover:bg-emerald-100/70" : "hover:bg-sky-100/70";
    const overrideTextClass =
      theme === "emerald"
        ? "font-bold text-emerald-900 underline decoration-emerald-400 decoration-dotted underline-offset-2"
        : "font-bold text-sky-800 underline decoration-sky-400 decoration-dotted underline-offset-2";
    const groupHoverTextClass =
      theme === "emerald" ? "group-hover:text-emerald-700" : "group-hover:text-sky-600";

    if (isEditing) {
      return (
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={tempCellInput}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTempCellInput(formatVNDInput(e.target.value))}
          onBlur={() => commitMoneyCell(columnId, rowKey, baseVal)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitMoneyCell(columnId, rowKey, baseVal);
            if (e.key === "Escape") setActiveCell(null);
          }}
          placeholder="0"
          className={`w-full min-w-[85px] rounded bg-white px-1.5 py-0.5 text-right text-xs font-bold text-slate-900 shadow-xs outline-none tabular-nums ${ringClass}`}
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEditingMoney(columnId, rowKey, currentVal)}
        className={`group w-full rounded px-1.5 py-0.5 text-right text-xs transition-colors focus-visible:outline-none ${
          canManage ? `${hoverClass} cursor-pointer` : "cursor-default"
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
              isOverridden ? overrideTextClass : "font-medium text-slate-800"
            }`}
          >
            {money(currentVal, currency)}
          </span>
        ) : (
          <span className={`text-slate-300 ${groupHoverTextClass} font-normal`}>
            —
          </span>
        )}
      </button>
    );
  }

  // Editable text cell renderer (Dùng cho Số phòng, Số chứng từ, Ngày thanh toán, Giờ CK)
  function renderEditableTextCell({
    field,
    rowKey,
    baseValue,
    currentValue,
    placeholder = "—",
    align = "left",
    prefix = "",
    theme = "sky",
  }: {
    field: string;
    rowKey: string;
    baseValue: string;
    currentValue: string;
    placeholder?: string;
    align?: "left" | "center" | "right";
    prefix?: string;
    theme?: "sky" | "emerald";
  }) {
    const isEditing =
      activeCell?.type === "text" &&
      activeCell?.columnId === field &&
      activeCell?.rowKey === rowKey;
    const isOverridden = textOverrides[`${book.hotelId}:${field}:${rowKey}`] !== undefined;

    const ringClass =
      theme === "emerald"
        ? "border-emerald-500 ring-2 ring-emerald-200"
        : "border-sky-500 ring-2 ring-sky-200";
    const hoverClass =
      theme === "emerald" ? "hover:bg-emerald-100/70" : "hover:bg-sky-100/70";
    const overrideTextClass =
      theme === "emerald"
        ? "font-bold text-emerald-950 underline decoration-emerald-400 decoration-dotted underline-offset-2"
        : "font-bold text-sky-950 underline decoration-sky-400 decoration-dotted underline-offset-2";
    const groupHoverTextClass =
      theme === "emerald" ? "group-hover:text-emerald-700" : "group-hover:text-sky-700";

    const textAlignClass =
      align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

    if (isEditing) {
      return (
        <input
          type="text"
          autoFocus
          value={tempCellInput}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTempCellInput(e.target.value)}
          onBlur={() => commitTextCell(field, rowKey, baseValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTextCell(field, rowKey, baseValue);
            if (e.key === "Escape") setActiveCell(null);
          }}
          placeholder={placeholder}
          className={`w-full min-w-[70px] rounded bg-white px-1.5 py-0.5 ${textAlignClass} text-xs font-medium text-slate-900 shadow-xs outline-none ${ringClass}`}
        />
      );
    }

    const displayValue = currentValue.trim();

    return (
      <button
        type="button"
        onClick={() => startEditingText(field, rowKey, currentValue)}
        className={`group w-full rounded px-1.5 py-0.5 ${textAlignClass} text-xs transition-colors focus-visible:outline-none ${
          canManage ? `${hoverClass} cursor-pointer` : "cursor-default"
        }`}
        title={
          canManage
            ? isOverridden
              ? "Nội dung đã tùy chỉnh. Click để sửa (xóa trắng để về mặc định)."
              : "Click để nhập hoặc sửa"
            : undefined
        }
      >
        {displayValue ? (
          <span
            className={
              isOverridden ? overrideTextClass : "text-slate-800 font-medium"
            }
          >
            {prefix && !displayValue.startsWith(prefix) ? `${prefix}${displayValue}` : displayValue}
          </span>
        ) : (
          <span className={`text-slate-300 ${groupHoverTextClass} font-normal`}>
            {placeholder}
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

  function renderEditableDescriptionCell(
    rowKey: string,
    baseDescription: string,
    currentDescription: string,
    entryId: string,
    isManual?: boolean,
    isVoided?: boolean,
  ) {
    const isEditing =
      activeCell?.type === "description" && activeCell?.rowKey === rowKey;
    const isOverridden =
      descriptionsByRow[`${book.hotelId}:${rowKey}`] !== undefined;

    if (isEditing) {
      return (
        <input
          type="text"
          autoFocus
          value={tempCellInput}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTempCellInput(e.target.value)}
          onBlur={() => commitDescriptionCell(rowKey, baseDescription)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDescriptionCell(rowKey, baseDescription);
            if (e.key === "Escape") setActiveCell(null);
          }}
          placeholder="Nhập diễn giải..."
          className="w-full min-w-[160px] rounded border border-sky-500 bg-white px-2 py-1 text-xs font-medium text-slate-900 shadow-xs outline-none ring-2 ring-sky-200"
        />
      );
    }

    return (
      <div className="group/desc flex items-center justify-between gap-1 w-full">
        <button
          type="button"
          onClick={() => startEditingDescription(rowKey, currentDescription)}
          className={`group/btn flex-1 text-left text-xs font-medium rounded px-1.5 py-1 transition-colors focus-visible:outline-none ${
            canManage ? "hover:bg-sky-100/70 cursor-pointer" : "cursor-default"
          }`}
          title={
            canManage
              ? isOverridden
                ? "Diễn giải đã tùy chỉnh. Click để sửa (xóa trắng để về mặc định)."
                : "Click để sửa diễn giải"
              : undefined
          }
        >
          <span
            className={
              isOverridden
                ? "font-bold text-sky-950 underline decoration-sky-400 decoration-dotted underline-offset-2"
                : "text-slate-800"
            }
          >
            {currentDescription || "—"}
          </span>
          {isManual && (
            <span className="ml-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
              {isVoided ? "Đã hủy" : "Bổ sung"}
            </span>
          )}
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/desc:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectEntry(entryId);
            }}
            className="p-1 text-slate-400 hover:text-[var(--primary)] hover:bg-slate-100 rounded transition-all cursor-pointer"
            title="Xem chi tiết khoản phát sinh"
          >
            <VsIcon name="visibility" className="text-sm" />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDeleteRow(rowKey, currentDescription || baseDescription);
              }}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
              title="Xóa dòng này khỏi sổ doanh thu"
            >
              <VsIcon name="delete" className="text-sm" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Manual save confirmation
  async function handleManualSave() {
    await showSuccessAlert(
      "Đã lưu sổ doanh thu",
      "Toàn bộ các cột tự thêm, diễn giải, số tiền và ghi chú đã nhập được lưu an toàn trên hệ thống.",
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

          {/* Custom Columns Pills with quick delete */}
          {customColumns.map((col) => (
            <div
              key={col.id}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-100/90 px-2.5 py-1 text-xs font-semibold text-sky-950 shadow-xs"
            >
              <span>{col.name}</span>
              {canManage && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingColumn(col);
                      setRenameValue(col.name);
                    }}
                    className="rounded p-0.5 text-sky-700 hover:bg-sky-200 focus-visible:outline-none cursor-pointer"
                    title={`Đổi tên cột "${col.name}"`}
                    aria-label={`Đổi tên cột ${col.name}`}
                  >
                    <VsIcon name="edit" className="text-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveColumn(col)}
                    className="rounded p-0.5 text-rose-600 hover:bg-rose-200 hover:text-rose-800 focus-visible:outline-none cursor-pointer"
                    title={`Xóa cứng cột "${col.name}"`}
                    aria-label={`Xóa cứng cột ${col.name}`}
                  >
                    <VsIcon name="close" className="text-xs font-bold" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Built-in system columns (Giặt ủi, Dịch vụ khác) */}
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

        {/* Actions: Clean up, Restore, and Save */}
        <div className="flex items-center gap-2">
          {deletedRowKeys.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDataManageTab("deleted");
                setIsManagingData(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 shadow-xs cursor-pointer"
              title="Xem và khôi phục các dòng đã xóa"
            >
              <VsIcon name="history" className="text-base text-amber-700" />
              <span>Đã xóa {deletedRowKeys.length} dòng</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => {
                setDataManageTab("rows");
                setSelectedRowKeysToDelete([]);
                setIsManagingData(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 shadow-xs cursor-pointer"
              title="Mở giao diện xóa và dọn dẹp các dòng không cần thiết"
            >
              <VsIcon name="delete_sweep" className="text-base text-rose-600" />
              <span>Xóa / Dọn data</span>
            </button>
          )}

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

      {/* Section: Quản lý & Xóa cứng các cột doanh thu đã thêm */}
      {canManage && (
        <section className="rounded-2xl border border-sky-200/90 bg-sky-50/50 p-3.5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                <VsIcon name="view_column" className="text-sm" />
              </span>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Cột doanh thu tự thêm &amp; Xóa cứng
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${
                  customColumns.length > 0
                    ? "bg-sky-100 border-sky-300 text-sky-900"
                    : "bg-slate-100 border-slate-300 text-slate-600"
                }`}
              >
                {customColumns.length > 0 ? `Đang có ${customColumns.length} cột` : "Chưa có cột nào"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewColumnName("");
                  setColumnError("");
                  setIsAddingColumn(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-sky-500 bg-white px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-50 transition-colors shadow-xs cursor-pointer"
              >
                <VsIcon name="add_circle" className="text-sm text-sky-600" />
                <span>+ Thêm cột mới</span>
              </button>

              {customColumns.length > 1 && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAllCustomColumns()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors shadow-xs cursor-pointer"
                  title="Xóa vĩnh viễn tất cả các cột doanh thu tự thêm khỏi bảng tính"
                >
                  <VsIcon name="delete_forever" className="text-sm text-rose-600" />
                  <span>Xóa tất cả ({customColumns.length} cột)</span>
                </button>
              )}
            </div>
          </div>

          {customColumns.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white/70 px-3.5 py-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <VsIcon name="info" className="text-sm text-slate-400" />
                <span className="text-pretty">
                  Chưa có cột doanh thu tự thêm. Bấm <strong>&quot;+ Thêm cột mới&quot;</strong> để tạo các khoản thu tùy chỉnh (Đưa đón, Tour, Cho thuê xe...). Khi không dùng nữa, bạn có thể bấm <strong>&quot;Xóa cứng&quot;</strong> ngay tại đây để gỡ bỏ hoàn toàn.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              {customColumns.map((col) => {
                const filledCount = Object.entries(valuesByCell).filter(
                  ([k, v]) =>
                    k.startsWith(`${book.hotelId}:${col.id}:`) &&
                    typeof v === "number" &&
                    v > 0,
                ).length;

                return (
                  <div
                    key={col.id}
                    className="flex items-center gap-2.5 rounded-xl border border-sky-300 bg-white px-3 py-1.5 shadow-xs hover:border-sky-400 transition-all"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-900 leading-tight">
                        {col.name}
                      </span>
                      <span className="text-xs text-slate-500 font-normal">
                        {filledCount > 0 ? `${filledCount} dòng có số tiền` : "Chưa có số tiền"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingColumn(col);
                          setRenameValue(col.name);
                        }}
                        className="rounded p-1 text-slate-400 hover:text-sky-700 hover:bg-sky-50 transition-colors cursor-pointer"
                        title={`Đổi tên cột "${col.name}"`}
                      >
                        <VsIcon name="edit" className="text-sm" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRemoveColumn(col)}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors cursor-pointer shadow-2xs"
                        title={`Xóa cứng vĩnh viễn cột "${col.name}"`}
                      >
                        <VsIcon name="delete" className="text-xs" />
                        <span>Xóa cứng</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Spreadsheet Grid Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-xs max-h-[75vh]">
        <table className="w-full min-w-[1200px] border-collapse text-xs text-left">
          {/* Header 4 Tiers */}
          <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800 shadow-xs">
            {/* Tier 1 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th rowSpan={4} className="px-2 py-2 w-12 bg-slate-100 text-center">
                {isSelectionMode ? (
                  <input
                    type="checkbox"
                    checked={
                      activeActivities.length > 0 &&
                      selectedRowKeys.length === activeActivities.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRowKeys(
                          activeActivities.map(
                            (a) => `${a.entry.id}_${a.date}_${a.collection?.id ?? "rev"}`,
                          ),
                        );
                      } else {
                        setSelectedRowKeys([]);
                      }
                    }}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    title="Chọn tất cả các dòng"
                  />
                ) : (
                  "TT"
                )}
              </th>
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
                      const local = collection
                        ? localParts(collection.receivedAt, book.timeZone)
                        : null;

                      const rowKey = `${entry.id}_${act.date}_${collection?.id ?? "rev"}`;

                      // Effective text overrides
                      const effectiveRoom =
                        textOverrides[`${book.hotelId}:roomNumber:${rowKey}`] ??
                        entry.roomNumber ??
                        "";
                      const effectiveDoc =
                        textOverrides[`${book.hotelId}:docNumber:${rowKey}`] ??
                        entry.documentNumber ??
                        "";
                      const effectivePaymentDate =
                        textOverrides[`${book.hotelId}:paymentDate:${rowKey}`] ??
                        (local ? dateLabel(local.date) : "");
                      const effectiveBankTime =
                        textOverrides[`${book.hotelId}:bankTime:${rowKey}`] ??
                        (local?.time ?? "");

                      // Base revenues from API
                      const baseRoom = revenue?.roomRevenue ?? 0;
                      const baseLaundry = revenue?.laundryRevenue ?? 0;
                      const baseOther = revenue?.otherRevenue ?? 0;
                      const baseRevTotal = revenue?.revenueTotal ?? 0;

                      // Overridden/effective values
                      const roomVal = valuesByCell[`${book.hotelId}:room:${rowKey}`] ?? baseRoom;
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

                      // Row total revenue (AUTO TÍNH TOÁN)
                      const finalRowRevenueTotal = addMoney(
                        addMoney(roomVal, laundryVal),
                        addMoney(otherVal, rowCustomSum),
                      );

                      // Base payments from API
                      const basePaid = collection?.amount ?? 0;
                      const baseCash = collection?.method === "CASH" ? basePaid : 0;
                      const baseBank = collection?.method === "BANK_TRANSFER" ? basePaid : 0;
                      const baseOtherPayment =
                        collection &&
                        collection.method !== "CASH" &&
                        collection.method !== "BANK_TRANSFER"
                          ? basePaid
                          : 0;

                      // Overridden/effective payments
                      const cashVal = valuesByCell[`${book.hotelId}:cash:${rowKey}`] ?? baseCash;
                      const bankVal = valuesByCell[`${book.hotelId}:bank:${rowKey}`] ?? baseBank;
                      const otherPaymentVal =
                        valuesByCell[`${book.hotelId}:otherPayment:${rowKey}`] ?? baseOtherPayment;

                      // Row total payment (AUTO TÍNH TOÁN)
                      const finalRowPaidTotal = addMoney(
                        addMoney(cashVal, bankVal),
                        otherPaymentVal,
                      );

                      // Delta revenue & delta payment compared to original API data
                      const deltaRevenue = addMoney(finalRowRevenueTotal, -baseRevTotal);
                      const deltaPaid = addMoney(finalRowPaidTotal, -basePaid);
                      const deltaNet = addMoney(deltaRevenue, -deltaPaid);
                      const finalClosing =
                        act.closing !== undefined ? addMoney(act.closing, deltaNet) : undefined;

                      // Description & Note value
                      const rowDesc = descriptionsByRow[`${book.hotelId}:${rowKey}`] ?? entry.description;
                      const rowNote = notesByRow[`${book.hotelId}:${rowKey}`] ?? entry.notes ?? "";

                      return (
                        <tr
                          key={`act-${entry.id}-${act.date}-${collection?.id ?? "rev"}-${seq}`}
                          className={`hover:bg-sky-50/30 transition-colors divide-x divide-slate-100 ${
                            selectedRowKeys.includes(rowKey) ? "bg-rose-50/50" : ""
                          }`}
                        >
                          <td className="px-2 py-2 text-center text-slate-500 font-mono">
                            {isSelectionMode ? (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={selectedRowKeys.includes(rowKey)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRowKeys((prev) => [...prev, rowKey]);
                                    } else {
                                      setSelectedRowKeys((prev) =>
                                        prev.filter((k) => k !== rowKey),
                                      );
                                    }
                                  }}
                                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                />
                                <span className="text-slate-400 text-xs">{seq}</span>
                              </div>
                            ) : (
                              seq
                            )}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-slate-700 font-mono text-center">
                            {act.date ? dateLabel(act.date) : "—"}
                          </td>
                          <td className="px-1 py-1 whitespace-nowrap text-center font-medium">
                            {renderEditableTextCell({
                              field: "roomNumber",
                              rowKey,
                              baseValue: entry.roomNumber ? `P.${entry.roomNumber}` : "",
                              currentValue: effectiveRoom,
                              placeholder: "+ Phòng",
                              align: "center",
                              prefix: "P.",
                            })}
                          </td>
                          {visibleColumns.docNumber && (
                            <td className="px-1 py-1 text-slate-600 font-mono text-center">
                              {renderEditableTextCell({
                                field: "docNumber",
                                rowKey,
                                baseValue: entry.documentNumber || "",
                                currentValue: effectiveDoc,
                                placeholder: "+ Số CT",
                                align: "center",
                              })}
                            </td>
                          )}
                          <td className="px-2 py-1 font-medium">
                            {renderEditableDescriptionCell(
                              rowKey,
                              entry.description,
                              rowDesc,
                              entry.id,
                              entry.source === "MANUAL",
                              Boolean(entry.voidedAt),
                            )}
                          </td>

                          {/* Doanh thu Tiền phòng (Inline Editable) */}
                          <td className="px-1 py-1 text-right tabular-nums text-slate-800">
                            {renderEditableMoneyCell({
                              columnId: "room",
                              rowKey,
                              baseVal: baseRoom,
                              currentVal: roomVal,
                              theme: "sky",
                            })}
                          </td>

                          {/* Doanh thu Giặt ủi (Inline Editable) */}
                          {visibleColumns.laundry && (
                            <td className="px-1 py-1 text-right tabular-nums text-slate-800">
                              {renderEditableMoneyCell({
                                columnId: "laundry",
                                rowKey,
                                baseVal: baseLaundry,
                                currentVal: laundryVal,
                                theme: "sky",
                              })}
                            </td>
                          )}

                          {/* Doanh thu Dịch vụ khác (Inline Editable) */}
                          {visibleColumns.otherRevenue && (
                            <td className="px-1 py-1 text-right tabular-nums text-slate-800">
                              {renderEditableMoneyCell({
                                columnId: "other",
                                rowKey,
                                baseVal: baseOther,
                                currentVal: otherVal,
                                theme: "sky",
                              })}
                            </td>
                          )}

                          {/* Custom Columns Cells (Inline Editable) */}
                          {customColumns.map((col) => {
                            const val = rowCustomValues[col.id] ?? 0;
                            return (
                              <td
                                key={col.id}
                                className="px-1 py-1 text-right tabular-nums bg-sky-50/40"
                              >
                                {renderEditableMoneyCell({
                                  columnId: col.id,
                                  rowKey,
                                  baseVal: 0,
                                  currentVal: val,
                                  theme: "sky",
                                })}
                              </td>
                            );
                          })}

                          {/* Tổng doanh thu hằng ngày (Auto Calculated) */}
                          <td className="px-2 py-2 text-right tabular-nums font-semibold bg-sky-50/60 text-sky-950">
                            {finalRowRevenueTotal !== 0 ? money(finalRowRevenueTotal, currency) : "—"}
                          </td>

                          {/* Ngày tháng thanh toán (Inline Editable) */}
                          <td className="px-1 py-1 text-center font-mono whitespace-nowrap">
                            {renderEditableTextCell({
                              field: "paymentDate",
                              rowKey,
                              baseValue: local ? dateLabel(local.date) : "",
                              currentValue: effectivePaymentDate,
                              placeholder: "+ Ngày TT",
                              align: "center",
                              theme: "emerald",
                            })}
                          </td>

                          {/* Tiền mặt (Inline Editable) */}
                          <td className="px-1 py-1 text-right tabular-nums">
                            {renderEditableMoneyCell({
                              columnId: "cash",
                              rowKey,
                              baseVal: baseCash,
                              currentVal: cashVal,
                              theme: "emerald",
                            })}
                          </td>

                          {/* Giờ CK (Inline Editable) */}
                          <td className="px-1 py-1 text-center font-mono text-xs">
                            {renderEditableTextCell({
                              field: "bankTime",
                              rowKey,
                              baseValue: local?.time || "",
                              currentValue: effectiveBankTime,
                              placeholder: "+ Giờ",
                              align: "center",
                              theme: "emerald",
                            })}
                          </td>

                          {/* Số tiền CK (Inline Editable) */}
                          <td className="px-1 py-1 text-right tabular-nums">
                            {renderEditableMoneyCell({
                              columnId: "bank",
                              rowKey,
                              baseVal: baseBank,
                              currentVal: bankVal,
                              theme: "emerald",
                            })}
                          </td>

                          {/* Tổng tiền thanh toán (Auto Calculated) */}
                          <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-900 bg-emerald-50/40">
                            {finalRowPaidTotal !== 0 ? money(finalRowPaidTotal, currency) : "—"}
                          </td>

                          {/* Thanh toán khác (Inline Editable) */}
                          {visibleColumns.otherPayment && (
                            <td className="px-1 py-1 text-right tabular-nums">
                              {renderEditableMoneyCell({
                                columnId: "otherPayment",
                                rowKey,
                                baseVal: baseOtherPayment,
                                currentVal: otherPaymentVal,
                                theme: "emerald",
                              })}
                            </td>
                          )}

                          {/* Còn nợ (Auto Calculated) */}
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-semibold ${
                              (finalClosing ?? 0) < 0 ? "text-rose-600 font-bold" : "text-slate-900"
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

      {/* Data Cleanup & Management Modal (Box Ngang Centered) */}
      {isManagingData && (
        <RevenueBookDialog
          title="Xóa và dọn dẹp dữ liệu sổ doanh thu"
          onClose={() => setIsManagingData(false)}
        >
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setDataManageTab("rows")}
                className={`border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  dataManageTab === "rows"
                    ? "border-rose-600 text-rose-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                Xóa nhanh dòng trong kỳ
              </button>
              <button
                type="button"
                onClick={() => setDataManageTab("deleted")}
                className={`border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  dataManageTab === "deleted"
                    ? "border-rose-600 text-rose-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                Dòng đã xóa ({deletedRowKeys.length})
              </button>
              <button
                type="button"
                onClick={() => setDataManageTab("reset")}
                className={`border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  dataManageTab === "reset"
                    ? "border-rose-600 text-rose-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                Đặt lại số liệu tùy chỉnh
              </button>
            </div>

            {/* Tab 1: Rows list with checkboxes for bulk deletion */}
            {dataManageTab === "rows" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <p className="text-slate-600">
                    Chọn các dòng không cần thiết (giao dịch thử nghiệm, khoản hủy...) để xóa khỏi sổ doanh thu:
                  </p>
                  {selectedRowKeysToDelete.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const count = selectedRowKeysToDelete.length;
                        const confirmation = await showConfirmDialog({
                          title: `Xóa ${count} dòng đã chọn`,
                          confirmText: `Xóa ${count} dòng`,
                          cancelText: "Hủy",
                          confirmVariant: "danger",
                          details: [
                            { label: "Số lượng dòng", value: `${count} dòng` },
                            {
                              label: "Lưu ý",
                              value:
                                "Các dòng này sẽ được loại khỏi bảng tính và số liệu tổng kỳ. Bạn có thể khôi phục lại bất kỳ lúc nào.",
                            },
                          ],
                        });
                        if (!confirmation.isConfirmed) return;
                        deleteRows(book.hotelId, selectedRowKeysToDelete);
                        setSelectedRowKeysToDelete([]);
                        void showSuccessAlert(
                          "Đã xóa thành công",
                          `Đã loại bỏ ${count} dòng khỏi sổ doanh thu.`,
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-xs cursor-pointer"
                    >
                      <VsIcon name="delete" className="text-sm" />
                      <span>Xóa {selectedRowKeysToDelete.length} dòng đã chọn</span>
                    </button>
                  )}
                </div>

                <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0 text-slate-700 font-semibold">
                      <tr>
                        <th className="p-2 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              activeActivities.length > 0 &&
                              selectedRowKeysToDelete.length === activeActivities.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRowKeysToDelete(
                                  activeActivities.map(
                                    (a) =>
                                      `${a.entry.id}_${a.date}_${a.collection?.id ?? "rev"}`,
                                  ),
                                );
                              } else {
                                setSelectedRowKeysToDelete([]);
                              }
                            }}
                            className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-2">Ngày</th>
                        <th className="p-2">Phòng</th>
                        <th className="p-2">Diễn giải</th>
                        <th className="p-2 text-right">Doanh thu</th>
                        <th className="p-2 text-right">Đã thanh toán</th>
                        <th className="p-2 text-center w-16">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {activeActivities.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400">
                            Không có dòng nào trong kỳ.
                          </td>
                        </tr>
                      ) : (
                        activeActivities.map((act) => {
                          const rowKey = `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`;
                          const isSelected = selectedRowKeysToDelete.includes(rowKey);
                          const desc =
                            descriptionsByRow[`${book.hotelId}:${rowKey}`] ??
                            act.entry.description;
                          const revTotal = act.revenue?.revenueTotal ?? 0;
                          const paidTotal = act.collection?.amount ?? 0;

                          return (
                            <tr
                              key={rowKey}
                              className={`hover:bg-slate-50 transition-colors ${
                                isSelected ? "bg-rose-50/40" : ""
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRowKeysToDelete((prev) => [
                                        ...prev,
                                        rowKey,
                                      ]);
                                    } else {
                                      setSelectedRowKeysToDelete((prev) =>
                                        prev.filter((k) => k !== rowKey),
                                      );
                                    }
                                  }}
                                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-2 font-mono">{act.date ? dateLabel(act.date) : "—"}</td>
                              <td className="p-2 font-medium">
                                {act.entry.roomNumber ? `P.${act.entry.roomNumber}` : "—"}
                              </td>
                              <td className="p-2 font-medium text-slate-900 max-w-xs truncate" title={desc}>
                                {desc}
                              </td>
                              <td className="p-2 text-right tabular-nums">
                                {revTotal > 0 ? money(revTotal, currency) : "—"}
                              </td>
                              <td className="p-2 text-right tabular-nums text-emerald-800">
                                {paidTotal > 0 ? money(paidTotal, currency) : "—"}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteRow(rowKey, desc)}
                                  className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Xóa dòng này"
                                >
                                  <VsIcon name="delete" className="text-base" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Deleted rows list with restore buttons */}
            {dataManageTab === "deleted" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <p className="text-slate-600">
                    Danh sách các dòng đã được loại bỏ khỏi sổ doanh thu:
                  </p>
                  {deletedRowKeys.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const confirmation = await showConfirmDialog({
                          title: "Khôi phục tất cả dòng đã xóa",
                          confirmText: "Khôi phục tất cả",
                          cancelText: "Hủy",
                          details: [
                            {
                              label: "Số lượng dòng",
                              value: `${deletedRowKeys.length} dòng`,
                            },
                          ],
                        });
                        if (!confirmation.isConfirmed) return;
                        restoreAllRows(book.hotelId);
                        void showSuccessAlert(
                          "Đã khôi phục tất cả",
                          "Toàn bộ các dòng đã được đưa trở lại bảng tính.",
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 shadow-xs cursor-pointer"
                    >
                      <VsIcon name="restore" className="text-sm" />
                      <span>Khôi phục tất cả ({deletedRowKeys.length})</span>
                    </button>
                  )}
                </div>

                <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0 text-slate-700 font-semibold">
                      <tr>
                        <th className="p-2">Ngày</th>
                        <th className="p-2">Phòng</th>
                        <th className="p-2">Diễn giải</th>
                        <th className="p-2 text-right">Doanh thu</th>
                        <th className="p-2 text-right">Đã thanh toán</th>
                        <th className="p-2 text-center w-24">Khôi phục</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {deletedActivities.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            Chưa có dòng nào bị xóa trong kỳ này.
                          </td>
                        </tr>
                      ) : (
                        deletedActivities.map((act) => {
                          const rowKey = `${act.entry.id}_${act.date}_${act.collection?.id ?? "rev"}`;
                          const desc =
                            descriptionsByRow[`${book.hotelId}:${rowKey}`] ??
                            act.entry.description;
                          const revTotal = act.revenue?.revenueTotal ?? 0;
                          const paidTotal = act.collection?.amount ?? 0;

                          return (
                            <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2 font-mono text-slate-500">
                                {act.date ? dateLabel(act.date) : "—"}
                              </td>
                              <td className="p-2 font-medium">
                                {act.entry.roomNumber ? `P.${act.entry.roomNumber}` : "—"}
                              </td>
                              <td className="p-2 font-medium text-slate-700 max-w-xs truncate" title={desc}>
                                {desc}
                              </td>
                              <td className="p-2 text-right tabular-nums text-slate-500">
                                {revTotal > 0 ? money(revTotal, currency) : "—"}
                              </td>
                              <td className="p-2 text-right tabular-nums text-slate-500">
                                {paidTotal > 0 ? money(paidTotal, currency) : "—"}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    restoreRow(book.hotelId, rowKey);
                                    void showSuccessAlert(
                                      "Đã khôi phục",
                                      `Đã đưa dòng "${desc}" trở lại sổ doanh thu.`,
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer"
                                >
                                  <VsIcon name="restore" className="text-xs" />
                                  <span>Khôi phục</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 3: Reset Overrides */}
            {dataManageTab === "reset" && (
              <div className="space-y-3 py-2">
                <p className="text-xs text-slate-600">
                  Xóa các số liệu tùy chỉnh đã nhập trực tiếp trên bảng tính để quay về số liệu gốc ban đầu của hệ thống:
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                    <span className="block text-xs font-bold text-slate-900">
                      Số tiền đã nhập / sửa
                    </span>
                    <p className="text-xs text-slate-500 text-pretty">
                      Xóa tất cả các số tiền đã nhập đè lên các ô doanh thu.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const conf = await showConfirmDialog({
                          title: "Đặt lại tất cả số tiền doanh thu",
                          confirmText: "Đặt lại về gốc",
                          cancelText: "Hủy",
                          confirmVariant: "danger",
                        });
                        if (!conf.isConfirmed) return;
                        clearAllCustomValues(book.hotelId);
                        void showSuccessAlert("Đã đặt lại", "Toàn bộ số tiền doanh thu đã về giá gốc.");
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors cursor-pointer"
                    >
                      Đặt lại số tiền về gốc
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                    <span className="block text-xs font-bold text-slate-900">
                      Diễn giải đã sửa
                    </span>
                    <p className="text-xs text-slate-500 text-pretty">
                      Xóa tất cả diễn giải đã chỉnh sửa và hoàn về diễn giải mặc định.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const conf = await showConfirmDialog({
                          title: "Đặt lại toàn bộ diễn giải",
                          confirmText: "Đặt lại về mặc định",
                          cancelText: "Hủy",
                          confirmVariant: "danger",
                        });
                        if (!conf.isConfirmed) return;
                        clearAllCustomDescriptions(book.hotelId);
                        void showSuccessAlert("Đã đặt lại", "Toàn bộ diễn giải đã về mặc định.");
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors cursor-pointer"
                    >
                      Đặt lại diễn giải về mặc định
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                    <span className="block text-xs font-bold text-slate-900">
                      Ghi chú đã nhập
                    </span>
                    <p className="text-xs text-slate-500 text-pretty">
                      Xóa tất cả ghi chú tùy chỉnh đã thêm trên từng dòng.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const conf = await showConfirmDialog({
                          title: "Xóa toàn bộ ghi chú tùy chỉnh",
                          confirmText: "Xóa tất cả",
                          cancelText: "Hủy",
                          confirmVariant: "danger",
                        });
                        if (!conf.isConfirmed) return;
                        clearAllCustomNotes(book.hotelId);
                        void showSuccessAlert("Đã xóa", "Toàn bộ ghi chú tùy chỉnh đã được làm sạch.");
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors cursor-pointer"
                    >
                      Xóa tất cả ghi chú
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </RevenueBookDialog>
      )}
    </div>
  );
}
