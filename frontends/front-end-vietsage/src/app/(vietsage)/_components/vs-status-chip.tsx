import { RequestStatus } from "../_data/mock";

type VsStatusChipProps = {
  status: RequestStatus;
};

const statusClassMap: Record<RequestStatus, string> = {
  "Chờ duyệt": "vs-status-pending",
  "Đã nhận": "vs-status-accepted",
  "Đang xử lý": "vs-status-progress",
  "Hoàn thành": "vs-status-done",
  "Đã hủy": "vs-status-cancel",
};

export function VsStatusChip({ status }: VsStatusChipProps) {
  return (
    <span
      className={`vs-pill inline-flex items-center px-3 py-1 text-xs font-semibold ${statusClassMap[status]}`}
    >
      {status}
    </span>
  );
}
