import type { KbttDelivery } from "../types/kbtt-contract";
import { sanitizeErrorMessage } from "../types/kbtt-contract";

const actionLabels = {
  INITIAL: "Khai báo",
  EXTEND: "Gia hạn",
  CHECKOUT: "Trả phòng",
  RECOVER: "Khai báo quá hạn",
};
const issueLabels = {
  FAILED: "Chưa gửi được",
  REJECTED: "Bị từ chối",
  UNKNOWN: "Cần đối soát",
  BLOCKED: "Cần xử lý",
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa xác định" : date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function KbttDeliveryStatus({
  delivery,
  isLoading,
  hasError,
}: {
  delivery: KbttDelivery | undefined;
  isLoading: boolean;
  hasError: boolean;
}) {
  if (isLoading || hasError || !delivery) {
    return (
      <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-700">
        {isLoading ? "Đang tải trạng thái gửi BCA…"
          : hasError ? "Không tải được trạng thái gửi BCA. Vui lòng làm mới để kiểm tra."
            : "Chưa có trạng thái gửi nền BCA. Chưa thể xác nhận kết quả đồng bộ."}
      </div>
    );
  }

  return (
    <section aria-label="Trạng thái gửi nền BCA" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-base font-semibold text-slate-900">
          {delivery.state === "RUNNING" ? "Gửi nền BCA đang bật"
            : delivery.state === "PAUSED" ? "Gửi nền BCA đang tạm dừng" : "Chưa kết nối BCA"}
        </p>
        {delivery.lastSucceededAt && (
          <p className="text-sm text-slate-600">BCA xác nhận gần nhất: {formatTime(delivery.lastSucceededAt)}</p>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-base text-slate-700">
        <div className="flex gap-2"><dt>Chờ gửi</dt><dd className="font-semibold tabular-nums">{delivery.pendingCount}</dd></div>
        <div className="flex gap-2"><dt>Đang gửi</dt><dd className="font-semibold tabular-nums">{delivery.sendingCount}</dd></div>
        <div className="flex gap-2"><dt>Cần xử lý</dt><dd className="font-semibold tabular-nums">{delivery.reviewCount}</dd></div>
      </dl>
      {!delivery.lifecycleEnabled && (
        <p className="text-base text-amber-900">Đồng bộ gia hạn và trả phòng đang tạm dừng.</p>
      )}
      {delivery.recentIssues.length > 0 && (
        <details className="border-t border-slate-200 pt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
            Hồ sơ cần xử lý gần đây ({delivery.recentIssues.length})
          </summary>
          <ul className="divide-y divide-slate-200">
            {delivery.recentIssues.map((issue) => (
              <li key={issue.id}>
                <details className="py-1">
                  <summary className="min-h-11 cursor-pointer py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                    <span className="break-words font-medium">Phòng {issue.roomNumber} · {issue.fullName}</span>
                    <span className="ml-2 text-sm text-slate-700">{actionLabels[issue.kind]} · {issueLabels[issue.status]}</span>
                  </summary>
                  <div className="space-y-1 pb-3 pl-4">
                    <p className="break-words text-pretty text-base text-slate-700">{sanitizeErrorMessage(issue.message) || "Cần kiểm tra hồ sơ trước khi gửi tiếp."}</p>
                    <p className="text-sm text-slate-600">{formatTime(issue.updatedAt)}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
