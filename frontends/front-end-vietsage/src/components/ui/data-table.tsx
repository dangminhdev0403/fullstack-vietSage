import type { ReactNode } from "react";

type DataTableColumn<TItem> = {
  key: string;
  header: ReactNode;
  cell: (item: TItem) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
};

type DataTableSortDirection = "asc" | "desc";

type DataTableSort = {
  key: string;
  direction: DataTableSortDirection;
  getSortHref?: (key: string, direction: DataTableSortDirection) => string;
  onSortChange?: (key: string, direction: DataTableSortDirection) => void;
};

type DataTablePagination = {
  page: number;
  pageSize: number;
  totalItems?: number;
  pageSizeOptions?: number[];
  serverSide?: boolean;
  getPageHref?: (page: number) => string;
  getPageSizeHref?: (pageSize: number) => string;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

type DataTableProps<TItem> = {
  columns: DataTableColumn<TItem>[];
  data: TItem[];
  getRowKey: (item: TItem) => string;
  emptyMessage: string;
  minWidth?: string;
  rowClassName?: (item: TItem) => string;
  onRowClick?: (item: TItem) => void;
  header?: ReactNode;
  footer?: ReactNode;
  pagination?: DataTablePagination;
  sort?: DataTableSort;
};

function joinClasses(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
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

function SortIndicator({
  direction,
}: {
  direction?: DataTableSortDirection;
}) {
  const commonProps = {
    className: "size-4 shrink-0",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (direction === "asc") {
    return (
      <svg {...commonProps}>
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </svg>
    );
  }

  if (direction === "desc") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

function PaginationAction({
  children,
  disabled,
  href,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const className = joinClasses(
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-sm font-semibold text-[var(--primary)] transition-colors",
    disabled
      ? "pointer-events-none cursor-not-allowed opacity-45"
      : "hover:bg-[var(--surface-container-low)]",
  );

  if (href && !disabled) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}

export function DataTable<TItem>({
  columns,
  data,
  getRowKey,
  emptyMessage,
  minWidth = "760px",
  rowClassName,
  onRowClick,
  header,
  footer,
  pagination,
  sort,
}: DataTableProps<TItem>) {
  const totalItems = pagination?.totalItems ?? data.length;
  const pageSize = Math.max(1, pagination?.pageSize ?? (data.length || 1));
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, pagination?.page ?? 1), pageCount);
  const pageData = pagination && !pagination.serverSide
    ? data.slice((page - 1) * pageSize, page * pageSize)
    : data;
  const bounds = pageBounds(totalItems, page, pageSize);
  const pageSizeOptions = pagination?.pageSizeOptions ?? [10, 25, 50];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white">
      {header}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
            <tr>
              {columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const nextDirection: DataTableSortDirection = isSorted && sort.direction === "asc" ? "desc" : "asc";
                const headerContent = column.sortable ? (
                  <span className={joinClasses("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-bold transition-colors", isSorted ? "text-[var(--primary)]" : "text-[var(--on-surface-variant)]")}>
                    <span>{column.header}</span>
                    <SortIndicator direction={isSorted ? sort.direction : undefined} />
                  </span>
                ) : column.header;

                return (
                  <th
                    key={column.key}
                    className={joinClasses("px-4 py-3", column.headerClassName)}
                    aria-sort={isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {column.sortable && sort?.getSortHref ? (
                      <a href={sort.getSortHref(column.key, nextDirection)} className="inline-flex">
                        {headerContent}
                      </a>
                    ) : column.sortable && sort?.onSortChange ? (
                      <button type="button" onClick={() => sort.onSortChange?.(column.key, nextDirection)} className="inline-flex cursor-pointer text-left">
                        {headerContent}
                      </button>
                    ) : headerContent}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--outline-variant)]">
            {pageData.map((item) => (
              <tr
                key={getRowKey(item)}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(item);
                        }
                      }
                    : undefined
                }
                className={joinClasses(
                  "transition-colors hover:bg-[var(--surface-container-low)]",
                  onRowClick && "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]",
                  rowClassName?.(item),
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={joinClasses(
                      "px-4 py-3 align-middle",
                      column.className,
                    )}
                  >
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
            {pageData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-[var(--on-surface-variant)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <div className="flex flex-col gap-3 border-t border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3 text-sm text-[var(--on-surface-variant)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span>{"Hi\u1ec3n th\u1ecb"}</span>
            {pagination.getPageSizeHref && !pagination.onPageSizeChange ? (
              <div className="inline-flex rounded-lg border border-[var(--outline-variant)] bg-white p-0.5">
                {pageSizeOptions.map((option) => (
                  <a
                    key={option}
                    href={pagination.getPageSizeHref?.(option)}
                    className={joinClasses(
                      "rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors",
                      option === pageSize
                        ? "bg-[var(--primary-fixed)] text-[var(--primary)]"
                        : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]",
                    )}
                  >
                    {option}
                  </a>
                ))}
              </div>
            ) : (
              <select
                value={pageSize}
                onChange={(event) =>
                  pagination.onPageSizeChange?.(Number(event.target.value))
                }
                className="h-9 rounded-lg border border-[var(--outline-variant)] bg-white px-2 text-sm outline-none focus:border-[var(--primary)]"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
            <span>{"d\u00f2ng"}</span>
            <span className="font-semibold text-[var(--primary)]">
              {bounds.start}-{bounds.end}
            </span>
            <span>/ {totalItems}</span>
          </div>
          <div className="flex items-center gap-2">
            <PaginationAction
              disabled={page <= 1}
              href={pagination.getPageHref?.(page - 1)}
              onClick={pagination.onPageChange ? () => pagination.onPageChange?.(page - 1) : undefined}
            >
              {"Tr\u01b0\u1edbc"}
            </PaginationAction>
            <span className="min-w-24 text-center text-sm font-semibold text-[var(--primary)]">
              {page} / {pageCount}
            </span>
            <PaginationAction
              disabled={page >= pageCount}
              href={pagination.getPageHref?.(page + 1)}
              onClick={pagination.onPageChange ? () => pagination.onPageChange?.(page + 1) : undefined}
            >
              Sau
            </PaginationAction>
          </div>
        </div>
      ) : (
        footer
      )}
    </div>
  );
}

export type { DataTableColumn, DataTableSortDirection };
