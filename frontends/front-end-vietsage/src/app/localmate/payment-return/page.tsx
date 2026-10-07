"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

function LocalMatePaymentReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const result = searchParams.get("result"); // "success" | "cancelled"
  const orderId = searchParams.get("orderId");
  const [countdown, setCountdown] = useState(5);
  const [returnChatUrl, setReturnChatUrl] = useState("/public/localmate/chat");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedChatUrl = localStorage.getItem("localmate_last_chat_url");
      let baseChatUrl = savedChatUrl || "/public/localmate/chat";
      if (orderId && !baseChatUrl.includes("orderId=")) {
        const sep = baseChatUrl.includes("?") ? "&" : "?";
        baseChatUrl = `${baseChatUrl}${sep}view=guide-chat&orderId=${encodeURIComponent(orderId)}`;
      } else if (!baseChatUrl.includes("view=guide-chat")) {
        const sep = baseChatUrl.includes("?") ? "&" : "?";
        baseChatUrl = `${baseChatUrl}${sep}view=guide-chat`;
      }
      setReturnChatUrl(baseChatUrl);

      if (result === "success") {
        if (orderId) {
          localStorage.setItem("localmate_active_order_id", orderId);
          localStorage.setItem("localmate_last_order_id", orderId);
        }
        localStorage.setItem("localmate_active_view_mode", "guide-chat");
        localStorage.setItem(
          "localmate_payment_success",
          JSON.stringify({
            timestamp: Date.now(),
            orderId: orderId || undefined,
          }),
        );

        // Bắn postMessage tới opener (nếu mở tab/popup mới từ trang chat)
        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage(
              {
                type: "LOCALMATE_PAYMENT_SUCCESS",
                orderId: orderId || undefined,
              },
              "*",
            );
          } catch {
            // Ignore cross-origin error if any
          }
        }
      }
    }
  }, [result, orderId]);

  // Tự động chuyển hướng về trang chat sau khi đếm ngược nếu thành công
  useEffect(() => {
    if (result !== "success") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push(returnChatUrl);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [result, returnChatUrl, router]);

  const handleClose = () => {
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  const isSuccess = result === "success";
  const isCancelled = result === "cancelled";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f4ea]/60 p-4 text-center dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-3xl border border-[#d6c08b]/40 bg-[#fffdf8] p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        {isSuccess ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950/50 dark:text-emerald-400">
              <VsIcon name="check_circle" className="h-9 w-9 text-emerald-600" />
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Giao dịch thành công</span>
            </div>

            <h1 className="mt-3 text-xl font-bold text-[#123d2a] dark:text-neutral-100">
              Thanh toán thành công!
            </h1>
            <p className="mt-2 text-sm text-[#38493f] dark:text-neutral-400 leading-relaxed">
              Yêu cầu đặt dịch vụ LocalMate đã hoàn tất. Thông tin đã được gửi trực tiếp tới Hướng dẫn viên bản địa để đón tiếp Quý khách.
            </p>

            <div className="mt-4 rounded-2xl border border-[#d6c08b]/30 bg-[#fff9ed] p-3 text-xs text-[#916e15]">
              💡 Quý khách có thể bắt đầu nhắn tin trao đổi điểm hẹn và thời gian đón tiếp ngay bây giờ.
              {countdown > 0 && (
                <div className="mt-1 font-semibold text-emerald-800">
                  Tự động chuyển về khung chat sau {countdown} giây...
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                href={returnChatUrl}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#184d35] active:scale-[0.98] transition"
              >
                <span>Vào khung chat với Hướng dẫn viên</span>
                <VsIcon name="arrow_forward" className="text-base text-[#f3c66b]" />
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400"
              >
                Đóng cửa sổ này
              </button>
            </div>
          </>
        ) : isCancelled ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm dark:bg-amber-950/50 dark:text-amber-400">
              <VsIcon name="warning" className="h-9 w-9 text-amber-600" />
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
              <span>Chưa hoàn tất</span>
            </div>

            <h1 className="mt-3 text-xl font-bold text-neutral-900 dark:text-neutral-100">
              Thanh toán chưa hoàn tất
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Giao dịch đã được hủy hoặc chưa hoàn tất thanh toán. Quý khách có thể quay lại để tiếp tục hoặc chọn lại dịch vụ.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                href={returnChatUrl}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#184d35] active:scale-[0.98] transition"
              >
                <span>Quay lại khung chat LocalMate</span>
                <VsIcon name="arrow_forward" className="text-base text-[#f3c66b]" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#123d2a]/10 text-[#123d2a] dark:bg-neutral-800 dark:text-neutral-300">
              <VsIcon name="loader" className="h-8 w-8 animate-spin text-[#123d2a]" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">
              Đang xác nhận kết quả thanh toán...
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Vui lòng đợi giây lát trong khi hệ thống đồng bộ trạng thái giao dịch từ Stripe.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                href={returnChatUrl}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#184d35]"
              >
                Vào khung chat
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function LocalMatePaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f4ea]/60 p-4 text-center">
          <div className="w-full max-w-md rounded-3xl border border-[#d6c08b]/40 bg-[#fffdf8] p-6 shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#123d2a]/10 text-[#123d2a]">
              <VsIcon name="loader" className="h-8 w-8 animate-spin text-[#123d2a]" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-neutral-900">Đang tải...</h1>
          </div>
        </main>
      }
    >
      <LocalMatePaymentReturnContent />
    </Suspense>
  );
}
