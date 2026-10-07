"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  useLocalMateSessionStore,
  useLocalMateSessionStoreHydrated,
} from "@/features/localmate-public/store/localmate-session-store";
import { publicLocalMateResource } from "@/features/localmate-public/resource";

type VerificationStatus = "VERIFYING" | "PAID" | "CANCELLED" | "FAILED";

function LocalMatePaymentReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const result = searchParams.get("result"); // "success" | "cancelled" (hint only)
  const orderId = searchParams.get("orderId");
  const [countdown, setCountdown] = useState(5);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("VERIFYING");
  const storeHydrated = useLocalMateSessionStoreHydrated();
  const savedChatUrl = useLocalMateSessionStore((state) => state.lastChatUrl);
  const returnChatUrl = useMemo(() => {
    if (!storeHydrated || !savedChatUrl || savedChatUrl.startsWith("/public/")) return "/";
    try {
      const origin = window.location.origin;
      const parsed = new URL(savedChatUrl, origin);
      return parsed.origin === origin ? parsed.pathname + parsed.search : "/";
    } catch {
      return "/";
    }
  }, [savedChatUrl, storeHydrated]);

  // Verify backend order payment state - query parameters are hints only
  useEffect(() => {
    let isMounted = true;
    let pollCount = 0;
    const maxPolls = 8;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!orderId) return;

    const verifyOrder = async () => {
      try {
        const order = await queryClient.fetchQuery({
          ...publicLocalMateResource.bind({}).queries.order.options({ orderId }),
          staleTime: 0,
        });
        if (!isMounted) return;

        const pStatus = order?.payment?.status;
        if (pStatus === "PAID" || pStatus === "NOT_REQUIRED") {
          setVerificationStatus("PAID");
          useLocalMateSessionStore.getState().openGuideChat(orderId);

          // Bắn postMessage tới opener chỉ với explicit same-origin target
          if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(
                {
                  type: "LOCALMATE_PAYMENT_SUCCESS",
                  orderId,
                },
                window.location.origin,
              );
            } catch {
              // Ignore cross-origin error if any
            }
          }
          return;
        }

        if (pStatus === "CANCELLED" || (pStatus !== "OPEN" && pStatus !== "CREATING" && result === "cancelled")) {
          setVerificationStatus("CANCELLED");
          return;
        }

        if (pStatus === "FAILED" || pStatus === "EXPIRED") {
          setVerificationStatus("FAILED");
          return;
        }

        // Bounded polling while webhook/reconciliation finishes
        pollCount += 1;
        if (pollCount < maxPolls) {
          timer = setTimeout(verifyOrder, 1500);
        } else {
          setVerificationStatus(result === "cancelled" ? "CANCELLED" : "FAILED");
        }
      } catch {
        if (!isMounted) return;
        pollCount += 1;
        if (pollCount < maxPolls) {
          timer = setTimeout(verifyOrder, 1500);
        } else {
          setVerificationStatus("FAILED");
        }
      }
    };

    void verifyOrder();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, queryClient, result]);

  const displayedStatus = orderId
    ? verificationStatus
    : result === "cancelled"
      ? "CANCELLED"
      : "FAILED";

  // Tự động chuyển hướng về trang chat sau khi đếm ngược nếu đã xác nhận thành công
  useEffect(() => {
    if (displayedStatus !== "PAID") return;

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
  }, [displayedStatus, returnChatUrl, router]);

  const handleClose = () => {
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f4ea]/60 p-4 text-center dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-3xl border border-[#d6c08b]/40 bg-[#fffdf8] p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        {displayedStatus === "PAID" ? (
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
        ) : displayedStatus === "CANCELLED" ? (
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
        ) : displayedStatus === "FAILED" ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-700 shadow-sm dark:bg-red-950/50 dark:text-red-400">
              <VsIcon name="warning" className="h-9 w-9 text-red-600" />
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800 border border-red-200">
              <span>Chưa thể xác nhận</span>
            </div>

            <h1 className="mt-3 text-xl font-bold text-neutral-900 dark:text-neutral-100">
              Chưa thể xác nhận kết quả thanh toán
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Chưa thể đồng bộ trạng thái giao dịch từ Stripe hoặc giao dịch không thành công. Quý khách vui lòng quay lại khung chat để kiểm tra hoặc thử lại.
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
              Đang kiểm tra trạng thái thanh toán...
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
