import {
  computeNextVietnamDailySlot,
  sanitizeErrorMessage,
  type KbttConnection,
  type KbttDelivery,
} from "../types/kbtt-contract";
import { getKbttConnectionStatusInfo } from "../hooks/use-kbtt-connection";

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

function formatIssueMessage(message: string | null): string {
  if (message === "KBTT_RETRY_PENDING") return "Đang thử kết nối lại sau 10 giây.";
  if (message === "KBTT_TEMP_DISCONNECTED") return "Tạm ngắt kết nối BCA — đang chờ kết nối lại.";
  if (message === "KBTT_SESSION_ENDED" || message === "KBTT_AUTH_FAILED") return "Cần đăng nhập lại BCA.";
  if (
    message === "OUT_OF_DATE_WINDOW" ||
    message === "PRIOR_DAY_MANUAL_REQUIRED" ||
    message === "PRIOR_DAY_MANUAL"
  ) {
    return "Quá hạn ngày — gửi thủ công.";
  }
  return sanitizeErrorMessage(message) || "Cần kiểm tra hồ sơ trước khi gửi tiếp.";
}

export function KbttDeliveryStatus({
  delivery,
  connection,
  isLoading,
  hasError,
}: {
  delivery: KbttDelivery | undefined;
  connection?: KbttConnection;
  isLoading: boolean;
  hasError: boolean;
}) {
  if (isLoading || hasError || !delivery) {
    return (
      <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-pretty text-base text-slate-700">
        {isLoading ? "Đang tải trạng thái gửi BCA…"
          : hasError ? "Không tải được trạng thái gửi BCA. Vui lòng làm mới để kiểm tra."
            : "Chưa có trạng thái gửi nền BCA. Chưa thể xác nhận kết quả đồng bộ."}
      </div>
    );
  }

  const connectionStatus = connection ? getKbttConnectionStatusInfo(connection) : null;
  const nextScheduledSlotAt =
    delivery.nextScheduledSlotAt ?? computeNextVietnamDailySlot().scheduledAt;
  const nextCatchUpAt = delivery.nextCatchUpAt ?? connection?.nextCatchUpAt ?? null;

  const statusHeadline =
    connectionStatus?.isRetryPending
      ? "Đang thử kết nối lại sau 10 giây"
      : connectionStatus?.isTemporaryDisconnect
        ? "Tạm ngắt kết nối BCA — đang chờ kết nối lại"
        : connectionStatus?.isFacilityConflict
          ? connectionStatus.badgeLabel
          : connectionStatus?.isLoginRequired
            ? "Cần đăng nhập lại BCA"
            : delivery.state === "RUNNING"
              ? "Gửi nền BCA đang bật"
              : delivery.state === "PAUSED"
                ? "Gửi nền BCA đang tạm dừng"
                : "Chưa kết nối BCA";

  return (
    <section aria-label="Trạng thái gửi nền BCA" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-pretty text-base font-semibold text-slate-900">
          {statusHeadline}
        </p>
        {delivery.lastSucceededAt && (
          <p className="text-pretty text-sm text-slate-600">BCA xác nhận gần nhất: {formatTime(delivery.lastSucceededAt)}</p>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-base text-slate-700">
        <div className="flex gap-2"><dt>Chờ gửi</dt><dd className="font-semibold tabular-nums">{delivery.pendingCount}</dd></div>
        <div className="flex gap-2"><dt>Cần xử lý</dt><dd className="font-semibold tabular-nums">{delivery.reviewCount}</dd></div>
        <div className="flex gap-2"><dt>Phiên tiếp theo</dt><dd className="font-semibold tabular-nums">{formatTime(nextScheduledSlotAt)}</dd></div>
        {nextCatchUpAt ? (
          <div className="flex gap-2"><dt>Gửi bù 10 phút</dt><dd className="font-semibold tabular-nums">{formatTime(nextCatchUpAt)}</dd></div>
        ) : null}
      </dl>
      {!delivery.lifecycleEnabled && (
        <p className="text-pretty text-base text-amber-900">Đồng bộ gia hạn và trả phòng đang tạm dừng.</p>
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
                    <p className="break-words text-pretty text-base text-slate-700">{formatIssueMessage(issue.message)}</p>
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
