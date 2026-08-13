import type { ReactNode } from "react";

export type DataTableColumnType =
  | "code"
  | "text"
  | "number"
  | "money"
  | "date"
  | "status"
  | "actions"
  | "custom";

export type DataTableColumnAlign = "left" | "center" | "right";

export type DataTableColumnWidth =
  | "fixed"
  | "compact"
  | "medium"
  | "flexible"
  | (string & {});

export type DataTableColumnDef<TData> = {
  id?: string;
  key?: string;
  header: ReactNode | string;
  cell: (item: TData) => ReactNode;
  type?: DataTableColumnType;
  align?: DataTableColumnAlign;
  width?: DataTableColumnWidth;
  sortable?: boolean;
  headerClassName?: string;
  cellClassName?: string;
  className?: string;
};

export type DataTableColumn<TData> = DataTableColumnDef<TData>;

export type DataTableDensity = "comfortable" | "compact";

export type DataTableSortDirection = "asc" | "desc";

export type DataTableSortConfig = {
  key: string;
  direction: DataTableSortDirection;
  onSortChange?: (key: string, direction: DataTableSortDirection) => void;
  getSortHref?: (key: string, direction: DataTableSortDirection) => string;
};

export type DataTablePaginationConfig = {
  page: number;
  pageSize: number;
  totalItems?: number;
  pageSizeOptions?: number[];
  serverSide?: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  getPageHref?: (page: number) => string;
  getPageSizeHref?: (pageSize: number) => string;
};

export type DataTableSelectionConfig = {
  selectedIds: string[];
  onSelectAll?: () => void;
  onSelectRow?: (id: string) => void;
  isAllSelected?: boolean;
  bulkActions?: ReactNode;
};

export type DataTableProps<TData> = {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  getRowKey: (item: TData) => string;
  density?: DataTableDensity;
  minWidth?: string;
  loading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyState?: {
    title?: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
  };
  selection?: DataTableSelectionConfig;
  sort?: DataTableSortConfig;
  pagination?: DataTablePaginationConfig;
  toolbar?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  title?: ReactNode;
  rowClassName?: (item: TData) => string;
  onRowClick?: (item: TData) => void;
};
