import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export type StaffSaasReminderData = {
  dueSoonCount: number;
  overdueCount: number;
  dueSoonOutstandingAmount: number;
  overdueOutstandingAmount: number;
  nearestDueAt: string | null;
} | null;

export function StaffSaasReminder({ reminder }: { reminder: StaffSaasReminderData }) {
  if (!reminder) return null;

  const overdueCount = Number(reminder.overdueCount ?? 0);
  const dueSoonCount = Number(reminder.dueSoonCount ?? 0);

  if (overdueCount > 0) {
    const amount = Number(reminder.overdueOutstandingAmount ?? 0).toLocaleString("vi-VN");
    const dueDate = reminder.nearestDueAt ? new Date(reminder.nearestDueAt).toLocaleDateString("vi-VN") : null;

    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/90 p-4 shadow-sm dark:border-red-900/50 dark:bg-red-950/40">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
            <VsIcon name="warning" className="text-xl" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-red-900 dark:text-red-200">
                Quá hạn phí VietSage SaaS — {overdueCount} kỳ hóa đơn quá hạn
              </h4>
              <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-black uppercase text-white">
                Báo chủ khách sạn
              </span>
            </div>
            <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
              Tổng dư nợ quá hạn: <strong className="font-extrabold">{amount} VND</strong>.
              {dueDate && <span className="ml-1">Hạn chót: {dueDate}.</span>}
              Vui lòng thông báo cho chủ khách sạn thanh toán đúng hạn để bảo vệ dịch vụ vận hành.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (dueSoonCount > 0) {
    const amount = Number(reminder.dueSoonOutstandingAmount ?? 0).toLocaleString("vi-VN");
    const dueDate = reminder.nearestDueAt ? new Date(reminder.nearestDueAt).toLocaleDateString("vi-VN") : null;

    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <VsIcon name="schedule" className="text-xl" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-amber-900 dark:text-amber-200">
                Sắp đến hạn trong 7 ngày — {dueSoonCount} kỳ hóa đơn sắp đến hạn
              </h4>
              <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-black uppercase text-white">
                Báo chủ khách sạn
              </span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Số tiền cần thanh toán: <strong className="font-extrabold">{amount} VND</strong>.
              {dueDate && <span className="ml-1">Hạn thanh toán: {dueDate}.</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
