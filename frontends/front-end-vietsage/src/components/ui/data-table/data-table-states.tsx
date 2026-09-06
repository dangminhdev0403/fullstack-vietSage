import type { ReactNode } from "react";

export function DataTableEmptyState({
  title = "Không có dữ liệu",
  description = "Không tìm thấy bản ghi nào phù hợp với bộ lọc hiện tại.",
  icon,
  action,
  colSpan,
}: Readonly<{
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  colSpan: number;
}>) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-12 text-center bg-slate-50/40">
        <div className="mx-auto max-w-sm space-y-3">
          {icon ? (
            <div className="text-3xl">{icon}</div>
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
          )}
          <h3 className="text-base font-extrabold text-slate-800">{title}</h3>
          <p className="text-sm font-medium text-slate-500">{description}</p>
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </td>
    </tr>
  );
}

export function DataTableErrorState({
  error,
  onRetry,
  colSpan,
}: Readonly<{
  error: Error | string;
  onRetry?: () => void;
  colSpan: number;
}>) {
  const errorMessage = typeof error === "string" ? error : error.message ?? "Đã có lỗi xảy ra";

  return (
    <tr>
      <td colSpan={colSpan} className="p-12 text-center bg-rose-50/30">
        <div className="mx-auto max-w-md space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-extrabold text-rose-900">Không thể tải dữ liệu bảng</h3>
          <p className="text-sm font-medium text-rose-700">{errorMessage}</p>
          {onRetry ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-rose-600 text-sm font-extrabold text-white shadow-xs hover:bg-rose-700 transition cursor-pointer"
              >
                🔄 Thử lại
              </button>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
