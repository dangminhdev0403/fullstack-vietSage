import type { DataTableColumnDef, DataTableDensity } from "./data-table.types";

type DataTableSkeletonProps<TData> = Readonly<{
  columns: DataTableColumnDef<TData>[];
  rowCount?: number;
  density?: DataTableDensity;
  selectable?: boolean;
}>;

export function DataTableSkeleton<TData>({
  columns,
  rowCount = 5,
  density = "comfortable",
  selectable = false,
}: DataTableSkeletonProps<TData>) {
  const pyClass = density === "compact" ? "py-2.5 px-3" : "py-4 px-4";
  const rows = Array.from({ length: rowCount });

  return (
    <>
      {rows.map((_, rowIndex) => {
        const rowKey = `skeleton-row-${rowIndex + 1}`;
        return (
          <tr key={rowKey} className="animate-pulse bg-white">
            {selectable ? (
              <td className={`${pyClass} text-center`}>
                <div className="mx-auto h-4 w-4 rounded bg-slate-200" />
              </td>
            ) : null}
            {columns.map((column, colIndex) => {
              const isRight = column.type === "money" || column.align === "right";
              const isCenter = column.type === "status" || column.align === "center";
              let widthStyle = "w-3/4";
              if (isRight) widthStyle = "ml-auto w-24";
              else if (isCenter) widthStyle = "mx-auto w-20";
              else if (colIndex === 0) widthStyle = "w-16";

              return (
                <td key={`col-${column.id}`} className={pyClass}>
                  <div className={`h-4 rounded bg-slate-200/80 ${widthStyle}`} />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
