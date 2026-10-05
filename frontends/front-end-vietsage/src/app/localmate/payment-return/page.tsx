"use client";

import Link from "next/link";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export default function LocalMatePaymentReturnPage() {
  const handleClose = () => {
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-4 text-center dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          <VsIcon name="loader" className="h-8 w-8 animate-spin" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">
          Đang kiểm tra trạng thái thanh toán
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Trang này chưa xác nhận giao dịch thành công. Quý khách vui lòng quay lại GuestOS để xem trạng thái đã được Stripe đồng bộ.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.98]"
          >
            Đóng cửa sổ này
          </button>
          <Link
            href="/guest/portal"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"
          >
            Về trang chủ GuestOS
          </Link>
        </div>
      </div>
    </main>
  );
}
