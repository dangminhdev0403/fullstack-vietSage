"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { useGuestMarketplace, useGuestMarketplaceOrder } from "../queries/use-guest-marketplace";
import type {
  GuestChatAction,
  MarketplaceOrder,
} from "../types/marketplace-contract";

export interface LocalMateOrderRequestDialogProps {
  action: GuestChatAction | null;
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  onOpenChat?: (orderId: string) => void;
}

export function LocalMateOrderRequestDialog({
  action,
  isOpen,
  onClose,
  sessionToken,
  onOpenChat,
}: LocalMateOrderRequestDialogProps) {
  const { locale } = useGuestI18n();
  const { order: createOrderMutation, cancelOrder: cancelOrderMutation } =
    useGuestMarketplace(sessionToken);

  // Form states
  const tomorrowDefault = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  const [requestedStartAt, setRequestedStartAt] = useState(tomorrowDefault);
  const [partySize, setPartySize] = useState(2);
  const [guestNote, setGuestNote] = useState("");
  const [createdOrder, setCreatedOrder] = useState<MarketplaceOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Poll order detail if created
  const { data: latestOrder } = useGuestMarketplaceOrder(
    sessionToken,
    createdOrder?.id,
  );
  const currentOrder = latestOrder ?? createdOrder;

  const formattedPrice = useMemo(() => {
    if (!action) return "0 ₫";
    const raw = Number(action.service.unitPrice);
    if (!Number.isFinite(raw) || raw <= 0) return "Liên hệ";
    return new Intl.NumberFormat("vi-VN").format(raw) + " ₫";
  }, [action]);

  const copy = useMemo(() => {
    switch (locale) {
      case "en":
        return {
          title: "Book LocalMate Guide",
          guide: "Assigned Guide",
          service: "Tour Service",
          dateTime: "Tour Date & Time",
          partySize: "Party Size (Guests)",
          note: "Special Notes for Guide",
          notePlaceholder: "E.g. preferred pickup point, dietary needs, trekking pace...",
          noPaymentNotice: "No upfront payment required. Settle upon confirmation or on room checkout.",
          submitBtn: "Confirm Booking Request",
          submitting: "Submitting request...",
          statusPending: "Awaiting Guide Confirmation",
          statusPendingDesc: "Your request has been routed to the guide's Telegram. You will receive an update shortly.",
          statusAck: "Guide Confirmed Your Tour!",
          statusAckDesc: "LocalMate has accepted. You can now chat directly with your guide.",
          statusRejected: "Guide Unavailable",
          statusRejectedDesc: "The guide is fully booked for this time. Please pick another time or guide.",
          statusCancelled: "Request Cancelled",
          openChat: "Open Chat with Guide",
          cancelRequest: "Cancel Request",
          cancelling: "Cancelling...",
          close: "Close",
        };
      default:
        return {
          title: "Đặt lịch hướng dẫn viên LocalMate",
          guide: "Hướng dẫn viên",
          service: "Dịch vụ tour",
          dateTime: "Ngày & giờ khởi hành",
          partySize: "Số lượng khách tham gia",
          note: "Ghi chú cho hướng dẫn viên",
          notePlaceholder: "Vd: điểm đón mong muốn, chế độ ăn, tốc độ đi bộ...",
          noPaymentNotice: "Không yêu cầu thanh toán trước. Chi phí thanh toán khi hoàn thành hoặc cộng vào hoá đơn phòng.",
          submitBtn: "Gửi yêu cầu đặt lịch",
          submitting: "Đang gửi yêu cầu...",
          statusPending: "Đang chờ LocalMate xác nhận",
          statusPendingDesc: "Yêu cầu đã được chuyển tới Telegram của hướng dẫn viên. LocalMate sẽ phản hồi trong ít phút.",
          statusAck: "LocalMate đã nhận lời!",
          statusAckDesc: "Hướng dẫn viên đã sẵn sàng đón tiếp. Quý khách có thể nhắn tin trực tiếp để trao đổi chi tiết.",
          statusRejected: "LocalMate bận lịch",
          statusRejectedDesc: "Hướng dẫn viên đã kín lịch vào khung giờ này. Quý khách vui lòng chọn thời gian khác.",
          statusCancelled: "Đã huỷ yêu cầu",
          openChat: "Nhắn tin với LocalMate",
          cancelRequest: "Huỷ yêu cầu",
          cancelling: "Đang huỷ...",
          close: "Đóng",
        };
    }
  }, [locale]);

  if (!isOpen || !action) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const startIso = new Date(requestedStartAt).toISOString();
    try {
      const order = await createOrderMutation.mutateAsync({
        serviceId: action.service.id,
        quantity: 1,
        guestNote: guestNote.trim() || undefined,
        requestedStartAt: startIso,
        partySize: Number(partySize) || 1,
        idempotencyKey: `idem_lm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setCreatedOrder(order);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Không thể tạo yêu cầu đặt lịch. Vui lòng thử lại.";
      setErrorMsg(message);
    }
  };

  const handleCancelOrder = async () => {
    if (!currentOrder?.id) return;
    try {
      await cancelOrderMutation.mutateAsync({ orderId: currentOrder.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Không thể huỷ yêu cầu.";
      setErrorMsg(message);
    }
  };

  const handleModalClose = () => {
    setCreatedOrder(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleModalClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <VsIcon name="calendar" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {copy.title}
              </h3>
              <p className="text-xs text-neutral-500">{action.localMate.fullName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
          >
            <VsIcon name="x" className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {/* State 1: Order created status */}
        {currentOrder ? (
          <div className="mt-5 space-y-4 text-center">
            {currentOrder.status === "PENDING" && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-5 dark:border-amber-900/40 dark:bg-amber-950/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
                  <VsIcon name="clock" className="h-6 w-6 animate-pulse" />
                </div>
                <h4 className="mt-3 text-base font-bold text-amber-900 dark:text-amber-200">
                  {copy.statusPending}
                </h4>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {copy.statusPendingDesc}
                </p>
                <div className="mt-3 text-xs font-mono text-neutral-500">
                  Đơn #{currentOrder.orderNumber}
                </div>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  disabled={cancelOrderMutation.isPending}
                  className="mt-4 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-neutral-900 dark:text-red-400"
                >
                  <VsIcon name="x-circle" className="h-4 w-4" />
                  {cancelOrderMutation.isPending ? copy.cancelling : copy.cancelRequest}
                </button>
              </div>
            )}

            {currentOrder.status === "ACKNOWLEDGED" && (
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <VsIcon name="check-circle" className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-base font-bold text-emerald-900 dark:text-emerald-200">
                  {copy.statusAck}
                </h4>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  {copy.statusAckDesc}
                </p>
                {onOpenChat && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChat(currentOrder.id);
                      handleModalClose();
                    }}
                    className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.98]"
                  >
                    <VsIcon name="message-square" className="h-4 w-4" />
                    {copy.openChat}
                  </button>
                )}
              </div>
            )}

            {currentOrder.status === "REJECTED" && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  <VsIcon name="alert-circle" className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {copy.statusRejected}
                </h4>
                <p className="mt-1 text-xs text-neutral-500">{copy.statusRejectedDesc}</p>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                >
                  {copy.close}
                </button>
              </div>
            )}

            {currentOrder.status === "CANCELLED" && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <h4 className="text-base font-bold text-neutral-700 dark:text-neutral-300">
                  {copy.statusCancelled}
                </h4>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                >
                  {copy.close}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* State 2: Booking Request Form */
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Guide & Service summary */}
            <div className="rounded-2xl bg-neutral-50 p-3.5 dark:bg-neutral-800/40">
              <div className="text-xs text-neutral-500">{copy.service}</div>
              <div className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-100">
                {action.service.name}
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-neutral-200/60 pt-2 dark:border-neutral-700/60">
                <span className="text-xs text-neutral-500">Giá trọn gói</span>
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                  {formattedPrice}
                </span>
              </div>
            </div>

            {/* Date time picker */}
            <div>
              <label
                htmlFor="lm-start-time"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                {copy.dateTime}
              </label>
              <input
                id="lm-start-time"
                type="datetime-local"
                value={requestedStartAt}
                onChange={(e) => setRequestedStartAt(e.target.value)}
                required
                className="mt-1 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            {/* Party size */}
            <div>
              <label
                htmlFor="lm-party-size"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                {copy.partySize}
              </label>
              <input
                id="lm-party-size"
                type="number"
                min="1"
                max="20"
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
                required
                className="mt-1 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            {/* Guest note */}
            <div>
              <label
                htmlFor="lm-note"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                {copy.note}
              </label>
              <textarea
                id="lm-note"
                rows={2}
                value={guestNote}
                onChange={(e) => setGuestNote(e.target.value)}
                placeholder={copy.notePlaceholder}
                className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            {/* No payment notice */}
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <VsIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{copy.noPaymentNotice}</span>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={createOrderMutation.isPending}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              <VsIcon name="send" className="h-4 w-4" />
              {createOrderMutation.isPending ? copy.submitting : copy.submitBtn}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
