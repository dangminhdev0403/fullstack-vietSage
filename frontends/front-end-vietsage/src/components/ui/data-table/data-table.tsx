import type { ReactNode } from "react";
import type {
  DataTableColumnAlign,
  DataTableColumnType,
  DataTableProps,
  DataTableSortDirection,
} from "./data-table.types";
import { DataTableSkeleton } from "./data-table-skeleton";
import { DataTableEmptyState, DataTableErrorState } from "./data-table-states";

function resolveAlignment(
  type?: DataTableColumnType,
  explicitAlign?: DataTableColumnAlign,
): DataTableColumnAlign {
  if (explicitAlign) return explicitAlign;
  if (type === "money" || type === "number") return "right";
  if (type === "status" || type === "actions") return "center";
  return "left";
}

function resolveWidthClass(width?: string, type?: DataTableColumnType): string {
  if (width) {
    if (width === "fixed") return "w-36 min-w-[144px]";
    if (width === "compact") return "w-32 min-w-[128px]";
    if (width === "medium") return "w-48 min-w-[192px]";
    if (width === "flexible") return "w-auto min-w-[240px]";
    return width;
  }
  if (type === "code") return "w-36 min-w-[144px]";
  if (type === "money" || type === "number") return "w-40 min-w-[150px]";
  if (type === "status") return "w-44 min-w-[170px]";
  if (type === "date") return "w-36 min-w-[130px]";
  if (type === "actions") return "w-36 min-w-[130px]";
  return "";
}

function SortIndicator({ direction }: Readonly<{ direction?: DataTableSortDirection }>) {
  const commonProps = {
    className: "h-3.5 w-3.5 shrink-0 transition-transform",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (direction === "asc") {
    return (
      <svg {...commonProps} className="h-3.5 w-3.5 shrink-0 text-emerald-700">
        <path d="m5 15 7-7 7 7" />
      </svg>
    );
  }

  if (direction === "desc") {
    return (
      <svg {...commonProps} className="h-3.5 w-3.5 shrink-0 text-emerald-700">
        <path d="m19 9-7 7-7-7" />
      </svg>
    );
  }

  return (
    <svg {...commonProps} className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-60">
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

function pageBounds(
  totalItems: number,
  page: number,
  pageSize: number,
): { start: number; end: number } {
  if (totalItems === 0) return { start: 0, end: 0 };
  return {
    start: (page - 1) * pageSize + 1,
    end: Math.min(totalItems, page * pageSize),
  };
}

function PaginationButton({
  children,
  disabled,
  href,
  onClick,
}: Readonly<{
  children: ReactNode;
  disabled: boolean;
  href?: string;
  onClick?: () => void;
}>) {
  const baseClass =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition-all shadow-2xs whitespace-nowrap";

  if (disabled) {
    return (
      <span className={`${baseClass} pointer-events-none cursor-not-allowed opacity-40`}>
        {children}
      </span>
    );
  }

  if (href) {
    return (
      <a href={href} className={`${baseClass} hover:bg-slate-100 hover:text-slate-900 cursor-pointer`}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} hover:bg-slate-100 hover:text-slate-900 cursor-pointer`}
    >
      {children}
    </button>
  );
}

export function DataTable<TData>({
  columns,
  data,
  getRowKey,
  density = "comfortable",
  minWidth = "1100px",
  loading = false,
  error = null,
  onRetry,
  emptyMessage,
  emptyState,
  selection,
  sort,
  pagination,
  toolbar,
  header,
  footer,
  title,
  rowClassName,
  onRowClick,
}: Readonly<DataTableProps<TData>>) {
  const selectable = Boolean(selection);
  const totalItems = pagination?.totalItems ?? data.length;
  const pageSize = Math.max(1, pagination?.pageSize ?? (data.length || 1));
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, pagination?.page ?? 1), pageCount);
  const pageData =
    pagination && !pagination.serverSide
      ? data.slice((page - 1) * pageSize, page * pageSize)
      : data;
  const bounds = pageBounds(totalItems, page, pageSize);
  const pageSizeOptions = pagination?.pageSizeOptions ?? [10, 25, 50];

  const pyClass = density === "compact" ? "py-2.5 px-4" : "py-3.5 px-4";
  const headerPyClass = density === "compact" ? "py-3 px-4" : "py-3.5 px-4";
  const totalCols = columns.length + (selectable ? 1 : 0);

  const selectedCount = selection?.selectedIds.length ?? 0;
  const resolvedEmptyTitle = emptyState?.title ?? emptyMessage ?? "Không có dữ liệu";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden space-y-0">
      {/* Header & Toolbar */}
      {title || toolbar || header || (selectable && selectedCount > 0) ? (
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-white space-y-4">
          {header}
          {title ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-lg font-extrabold text-slate-900">{title}</div>
            </div>
          ) : null}

          {/* Bulk Action Banner */}
          {selectable && selectedCount > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 shadow-2xs">
              <span className="text-xs font-extrabold text-amber-900">
                Đã chọn <b>{selectedCount}</b> bản ghi
              </span>
              {selection?.bulkActions ? (
                <div className="flex items-center gap-2">{selection.bulkActions}</div>
              ) : null}
            </div>
          ) : null}

          {toolbar ? <div>{toolbar}</div> : null}
        </div>
      ) : null}

      {/* Main Table Area */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed" style={{ minWidth }}>
          <thead>
            <tr className={`border-b-2 border-slate-200 bg-slate-100/90 text-xs font-black uppercase tracking-wider text-slate-600 ${headerPyClass}`}>
              {selectable ? (
                <th className={`${headerPyClass} w-12 min-w-[48px] text-center`}>
                  <input
                    type="checkbox"
                    checked={selection?.isAllSelected ?? (selectedCount > 0 && selectedCount === pageData.length)}
                    onChange={() => selection?.onSelectAll?.()}
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                  />
                </th>
              ) : null}

              {columns.map((column, index) => {
                const colId = column.id ?? column.key ?? `col-${index}`;
                const align = resolveAlignment(column.type, column.align);
                const isSorted = sort?.key === colId;
                const nextDirection: DataTableSortDirection =
                  isSorted && sort.direction === "asc" ? "desc" : "asc";

                const alignClass =
                  align === "right"
                    ? "text-right"
                    : align === "center"
                    ? "text-center"
                    : "text-left";

                const widthClass = resolveWidthClass(column.width, column.type);

                const headerContent = column.sortable ? (
                  <span className="inline-flex items-center gap-1.5 font-black text-slate-700 hover:text-slate-900 transition-colors">
                    <span>{column.header}</span>
                    <SortIndicator direction={isSorted ? sort.direction : undefined} />
                  </span>
                ) : (
                  column.header
                );

                return (
                  <th
                    key={colId}
                    className={`${headerPyClass} ${alignClass} ${widthClass} overflow-hidden min-w-0 ${column.headerClassName ?? ""}`}
                  >
                    {column.sortable && sort?.getSortHref ? (
                      <a href={sort.getSortHref(colId, nextDirection)} className="inline-flex cursor-pointer">
                        {headerContent}
                      </a>
                    ) : column.sortable && sort?.onSortChange ? (
                      <button
                        type="button"
                        onClick={() => sort.onSortChange?.(colId, nextDirection)}
                        className="inline-flex cursor-pointer text-left"
                      >
                        {headerContent}
                      </button>
                    ) : (
                      headerContent
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <DataTableSkeleton columns={columns} density={density} selectable={selectable} />
            ) : error ? (
              <DataTableErrorState error={error} onRetry={onRetry} colSpan={totalCols} />
            ) : pageData.length > 0 ? (
              pageData.map((item) => {
                const key = getRowKey(item);
                const isSelected = selection?.selectedIds.includes(key) ?? false;

                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    className={`transition-colors duration-150 ${
                      isSelected
                        ? "bg-amber-50/80 hover:bg-amber-50"
                        : "hover:bg-slate-50/80"
                    } ${onRowClick ? "cursor-pointer" : ""} ${
                      rowClassName?.(item) ?? ""
                    }`}
                  >
                    {selectable ? (
                      <td className={`${pyClass} w-12 min-w-[48px] text-center overflow-hidden`} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => selection?.onSelectRow?.(key)}
                          className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        />
                      </td>
                    ) : null}

                    {columns.map((column, index) => {
                      const colId = column.id ?? column.key ?? `col-${index}`;
                      const align = resolveAlignment(column.type, column.align);
                      const alignClass =
                        align === "right"
                          ? "text-right"
                          : align === "center"
                          ? "text-center"
                          : "text-left";
                      const widthClass = resolveWidthClass(column.width, column.type);

                      return (
                        <td
                          key={colId}
                          className={`${pyClass} ${alignClass} ${widthClass} overflow-hidden min-w-0 text-sm font-medium text-slate-900 ${
                            column.cellClassName ?? column.className ?? ""
                          }`}
                        >
                          {column.cell(item)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <DataTableEmptyState
                title={resolvedEmptyTitle}
                description={emptyState?.description}
                icon={emptyState?.icon}
                action={emptyState?.action}
                colSpan={totalCols}
              />
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-500">Hiển thị</span>
            <select
              value={pageSize}
              onChange={(e) => pagination.onPageSizeChange?.(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-emerald-600 focus:outline-none"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span className="font-medium text-slate-500">dòng |</span>
            <span className="font-extrabold text-slate-900">
              {bounds.start}-{bounds.end}
            </span>
            <span className="font-medium text-slate-500">trên tổng {totalItems}</span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <PaginationButton
              disabled={page <= 1}
              href={pagination.getPageHref?.(page - 1)}
              onClick={pagination.onPageChange ? () => pagination.onPageChange?.(page - 1) : undefined}
            >
              ← Trước
            </PaginationButton>

            <span className="min-w-17.5 text-center font-black text-slate-900">
              {page} / {pageCount}
            </span>

            <PaginationButton
              disabled={page >= pageCount}
              href={pagination.getPageHref?.(page + 1)}
              onClick={pagination.onPageChange ? () => pagination.onPageChange?.(page + 1) : undefined}
            >
              Sau →
            </PaginationButton>
          </div>
        </div>
      ) : footer ? (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4">{footer}</div>
      ) : null}
    </div>
  );
}
