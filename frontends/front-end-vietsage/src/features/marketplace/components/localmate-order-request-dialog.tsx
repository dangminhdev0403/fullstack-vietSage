"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import {
  useGuestMarketplace,
  useGuestMarketplaceOrder,
  useGuestMarketplacePaymentSession,
} from "../queries/use-guest-marketplace";
import type {
  GuestChatAction,
  LocalMateOrderPayment,
  LocalMatePaymentStatus,
  MarketplaceOrder,
} from "../types/marketplace-contract";

export interface LocalMateOrderRequestDialogProps {
  action: GuestChatAction | null;
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  onOpenChat?: (orderId: string) => void;
}

export function formatMonetaryVnd(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "Liên hệ";
  const num = Number(amount);
  if (!Number.isFinite(num) || num < 0) return "Liên hệ";
  return new Intl.NumberFormat("vi-VN").format(num) + " ₫";
}

export function isLocalMatePaymentTerminal(
  paymentStatus: LocalMatePaymentStatus | undefined,
  orderStatus: string | undefined,
): boolean {
  if (orderStatus === "CANCELLED" || orderStatus === "REJECTED" || orderStatus === "COMPLETED") {
    return true;
  }
  if (!paymentStatus) return false;
  return (
    paymentStatus === "PAID" ||
    paymentStatus === "NOT_REQUIRED" ||
    paymentStatus === "EXPIRED" ||
    paymentStatus === "CANCELLED" ||
    paymentStatus === "FAILED" ||
    paymentStatus === "REFUNDED" ||
    paymentStatus === "DISPUTED"
  );
}

export function shouldPollLocalMateOrder(
  isOpen: boolean,
  orderId: string | undefined,
  currentPaymentStatus: LocalMatePaymentStatus | undefined,
  currentOrderStatus: string | undefined,
): boolean {
  if (!isOpen || !orderId) return false;
  if (currentPaymentStatus === "REFUND_PENDING") return true;
  if (currentOrderStatus === "CANCELLED" || currentOrderStatus === "REJECTED" || currentOrderStatus === "COMPLETED") {
    return false;
  }
  if (isLocalMatePaymentTerminal(currentPaymentStatus, currentOrderStatus)) return false;
  return currentPaymentStatus === "CREATING" || currentPaymentStatus === "OPEN";
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
  const paymentSessionMutation = useGuestMarketplacePaymentSession(sessionToken);

  // Form states
  const tomorrowDefault = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, []);

  const [requestedStartAt, setRequestedStartAt] = useState(tomorrowDefault);
  const [partySize, setPartySize] = useState(2);
  const [guestNote, setGuestNote] = useState("");
  const [createdOrder, setCreatedOrder] = useState<MarketplaceOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Tour price from service contract (authoritative baseline before backend snapshot)
  const tourTotalNumber = useMemo(() => {
    if (!action) return null;
    const raw = Number(action.service.unitPrice);
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }, [action]);

  const copy = useMemo(() => {
    switch (locale) {
      case "en":
        return {
          title: "Book LocalMate Guide",
          guide: "Assigned Guide",
          service: "Tour Service",
          tourTotal: "Total Tour Price",
          platformFee: "VietSage confirmation fee",
          guideRemaining: "Remaining paid directly to guide",
          step1FeeNotice:
            "VietSage will confirm and lock the fee breakdown for review before payment. Deposit via Stripe to confirm booking; 100% refundable if the guide rejects.",
          policyNotice:
            "Deposit via Stripe to confirm booking. 100% refundable if guide rejects or cancels before the tour begins. Payment session expires in 30 minutes.",
          dateTime: "Tour Date & Time",
          partySize: "Party Size (Guests)",
          note: "Special Notes for Guide",
          notePlaceholder: "E.g. preferred pickup point, dietary needs, trekking pace...",
          step1SubmitBtn: "Create booking & review fee",
          step1Submitting: "Creating booking request...",
          confirmAndCreateQr: "Confirm and create payment QR",
          orderNumber: "Order #",
          creatingSession: "Generating Stripe payment QR...",
          scanQrTitle: "Scan QR Code to Pay Deposit",
          qrPhoneNotice:
            "If you are viewing this on your mobile device, you can tap 'Pay now' below instead of scanning the QR code.",
          payNow: "Pay now",
          paymentStatus: "Payment Status",
          statusCreating: "Creating Payment Session",
          statusCreatingDesc: "Please wait while we initialize your secure payment session.",
          statusOpen: "Awaiting Deposit Payment",
          statusOpenDesc:
            "Scan the QR code or tap 'Pay now' to complete your deposit. The session expires in 30 minutes.",
          statusPaid: "Deposit Paid Successfully!",
          statusPaidDesc:
            "Your deposit was confirmed! The request has been routed to your guide.",
          statusPendingAck: "Awaiting Guide Confirmation",
          statusPendingAckDesc:
            "Your booking request has been routed to the guide's Telegram. You will receive an update shortly.",
          statusAck: "Guide Confirmed Your Tour!",
          statusAckDesc:
            "LocalMate has accepted your booking! You can now chat directly with your guide.",
          statusRejected: "Guide Unavailable",
          statusRejectedDesc:
            "The guide is fully booked for this time. Any deposit paid will be automatically refunded 100%.",
          statusCancelled: "Request Cancelled",
          statusExpired: "Payment Session Expired",
          statusExpiredDesc:
            "The payment session has expired after 30 minutes. You can retry payment without creating a duplicate order.",
          statusFailed: "Payment Incomplete",
          statusFailedDesc:
            "The payment could not be completed. You can retry payment without creating a duplicate order.",
          statusRefundPending: "Refund Processing",
          statusRefundPendingDesc:
            "Your deposit is being refunded 100% back to your original payment method.",
          statusRefunded: "Deposit Refunded",
          statusRefundedDesc: "100% of your deposit has been refunded successfully.",
          statusDisputed: "Payment Under Review",
          statusDisputedDesc: "This payment is currently under review or dispute resolution.",
          providerUnavailable:
            "Online payment gateway is temporarily unavailable. Please try again shortly or contact the front desk for assistance.",
          retryPayment: "Retry Payment",
          retryingPayment: "Recreating payment session...",
          openChat: "Open Chat with Guide",
          cancelRequest: "Cancel Request",
          cancelling: "Cancelling...",
          close: "Close",
          autoUpdating: "This screen will update automatically as soon as payment is confirmed.",
        };
      case "ru":
        return {
          title: "Забронировать гида LocalMate",
          guide: "Назначенный гид",
          service: "Экскурсионная услуга",
          tourTotal: "Общая стоимость тура",
          platformFee: "Сбор за подтверждение VietSage",
          guideRemaining: "Остаток к оплате гиду на месте",
          step1FeeNotice:
            "VietSage подтвердит и зафиксирует точную сумму сбора перед оплатой. Депозит через Stripe для бронирования; 100% возврат средств, если гид отклонит тур.",
          policyNotice:
            "Депозит через Stripe для бронирования. 100% возврат средств, если гид отклонит или отменит тур до начала. Срок действия сессии оплаты — 30 минут.",
          dateTime: "Дата и время отправления",
          partySize: "Количество гостей",
          note: "Примечания для гида",
          notePlaceholder: "Например: место встречи, предпочтения в еде, темп ходьбы...",
          step1SubmitBtn: "Создать заявку и просмотреть сбор",
          step1Submitting: "Создание заявки на бронирование...",
          confirmAndCreateQr: "Подтвердить и создать QR для оплаты",
          orderNumber: "Заказ #",
          creatingSession: "Генерация QR-кода оплаты Stripe...",
          scanQrTitle: "Отсканируйте QR-код для внесения депозита",
          qrPhoneNotice:
            "Если вы используете это устройство, вы можете нажать 'Оплатить сейчас' ниже вместо сканирования QR-кода.",
          payNow: "Оплатить сейчас",
          paymentStatus: "Статус оплаты",
          statusCreating: "Создание сессии оплаты",
          statusCreatingDesc: "Пожалуйста, подождите, пока создается защищенная сессия оплаты.",
          statusOpen: "Ожидание оплаты депозита",
          statusOpenDesc:
            "Отсканируйте QR-код или нажмите 'Оплатить сейчас' для оплаты депозита. Срок действия — 30 минут.",
          statusPaid: "Депозит успешно оплачен!",
          statusPaidDesc:
            "Оплата депозита подтверждена! Запрос передан гиду.",
          statusPendingAck: "Ожидание подтверждения гидом",
          statusPendingAckDesc:
            "Запрос отправлен в Telegram гида. Ответ поступит в ближайшее время.",
          statusAck: "Гид подтвердил бронирование!",
          statusAckDesc:
            "LocalMate принял заказ! Вы можете написать гиду напрямую для уточнения деталей.",
          statusRejected: "Гид занят",
          statusRejectedDesc:
            "Гид занят в выбранное время. Внесенный депозит будет возвращен в размере 100%.",
          statusCancelled: "Запрос отменен",
          statusExpired: "Срок сессии оплаты истек",
          statusExpiredDesc:
            "Срок действия сессии оплаты истек (через 30 минут). Вы можете повторить оплату без создания нового заказа.",
          statusFailed: "Оплата не завершена",
          statusFailedDesc:
            "Не удалось завершить оплату. Вы можете повторить попытку без создания нового заказа.",
          statusRefundPending: "Обработка возврата",
          statusRefundPendingDesc:
            "Депозит возвращается в размере 100% на ваш исходный способ оплаты.",
          statusRefunded: "Депозит возвращен",
          statusRefundedDesc: "100% депозита успешно возвращены на ваш счет.",
          statusDisputed: "Платеж на рассмотрении",
          statusDisputedDesc: "Данный платеж находится в процессе рассмотрения спора.",
          providerUnavailable:
            "Платежный шлюз временно недоступен. Пожалуйста, попробуйте позже или обратитесь на стойку регистрации.",
          retryPayment: "Повторить оплату",
          retryingPayment: "Создание новой сессии...",
          openChat: "Чат с гидом",
          cancelRequest: "Отменить запрос",
          cancelling: "Отмена...",
          close: "Закрыть",
          autoUpdating: "Экран обновится автоматически сразу после подтверждения оплаты.",
        };
      default:
        return {
          title: "Đặt lịch hướng dẫn viên LocalMate",
          guide: "Hướng dẫn viên",
          service: "Dịch vụ tour",
          tourTotal: "Tổng giá tour",
          platformFee: "Phí xác nhận VietSage",
          guideRemaining: "Còn lại thanh toán cho hướng dẫn viên",
          step1FeeNotice:
            "VietSage sẽ xác nhận và hiển thị chi tiết mức phí chính xác trước khi thanh toán. Đặt cọc qua Stripe để giữ lịch, hoàn 100% nếu hướng dẫn viên từ chối nhận lịch.",
          policyNotice:
            "Đặt cọc qua Stripe để giữ lịch. Hoàn 100% nếu hướng dẫn viên từ chối nhận lịch hoặc huỷ trước khi bắt đầu. Phiên thanh toán hết hạn sau 30 phút.",
          dateTime: "Ngày & giờ khởi hành",
          partySize: "Số lượng khách tham gia",
          note: "Ghi chú cho hướng dẫn viên",
          notePlaceholder: "Vd: điểm đón mong muốn, chế độ ăn, tốc độ đi bộ...",
          step1SubmitBtn: "Tạo đơn và xem chi tiết phí",
          step1Submitting: "Đang tạo yêu cầu đặt lịch...",
          confirmAndCreateQr: "Xác nhận và tạo mã QR thanh toán",
          orderNumber: "Đơn #",
          creatingSession: "Đang tạo mã thanh toán Stripe...",
          scanQrTitle: "Quét mã QR để đặt cọc",
          qrPhoneNotice:
            "Nếu đang dùng điện thoại này, Quý khách có thể bấm 'Thanh toán ngay' bên dưới thay vì quét mã QR.",
          payNow: "Thanh toán ngay",
          paymentStatus: "Trạng thái thanh toán",
          statusCreating: "Đang khởi tạo thanh toán",
          statusCreatingDesc: "Quý khách vui lòng chờ trong giây lát trong khi em tạo phiên thanh toán.",
          statusOpen: "Chờ thanh toán cọc",
          statusOpenDesc:
            "Quý khách quét mã QR hoặc bấm 'Thanh toán ngay' để đặt cọc. Phiên thanh toán có hiệu lực trong 30 phút.",
          statusPaid: "Đặt cọc thành công!",
          statusPaidDesc:
            "Thanh toán cọc thành công! Em đã chuyển thông tin tới hướng dẫn viên.",
          statusPendingAck: "Đang chờ LocalMate xác nhận",
          statusPendingAckDesc:
            "Yêu cầu đã được chuyển tới Telegram của hướng dẫn viên. LocalMate sẽ phản hồi trong ít phút.",
          statusAck: "LocalMate đã nhận lời!",
          statusAckDesc:
            "Hướng dẫn viên đã sẵn sàng đón tiếp. Quý khách có thể nhắn tin trực tiếp để trao đổi chi tiết.",
          statusRejected: "LocalMate bận lịch",
          statusRejectedDesc:
            "Hướng dẫn viên đã kín lịch vào khung giờ này. Toàn bộ tiền cọc của Quý khách sẽ được hoàn 100%.",
          statusCancelled: "Đã huỷ yêu cầu",
          statusExpired: "Phiên thanh toán đã hết hạn",
          statusExpiredDesc:
            "Phiên thanh toán đã hết hạn sau 30 phút. Quý khách có thể tạo lại phiên thanh toán mà không làm thay đổi đơn.",
          statusFailed: "Thanh toán chưa thành công",
          statusFailedDesc:
            "Giao dịch chưa hoàn tất hoặc bị gián đoạn. Quý khách có thể thử lại mà không tạo thêm đơn mới.",
          statusRefundPending: "Đang xử lý hoàn cọc",
          statusRefundPendingDesc:
            "Khoản cọc đang được xử lý hoàn trả 100% về phương thức thanh toán ban đầu của Quý khách.",
          statusRefunded: "Đã hoàn cọc thành công",
          statusRefundedDesc: "Khoản cọc đã được hoàn trả 100% về tài khoản của Quý khách.",
          statusDisputed: "Giao dịch đang tra soát",
          statusDisputedDesc: "Giao dịch đang trong quá trình đối soát hoặc khiếu nại.",
          providerUnavailable:
            "Cổng thanh toán tạm thời không khả dụng. Quý khách vui lòng thử lại sau ít phút hoặc liên hệ lễ tân để được hỗ trợ.",
          retryPayment: "Thử lại thanh toán",
          retryingPayment: "Đang tạo lại phiên...",
          openChat: "Nhắn tin với LocalMate",
          cancelRequest: "Huỷ yêu cầu",
          cancelling: "Đang huỷ...",
          close: "Đóng",
          autoUpdating: "Hệ thống sẽ tự động cập nhật ngay khi Quý khách thanh toán xong.",
        };
    }
  }, [locale]);

  // Derived polling interval from latest/current order state
  const { data: latestOrder } = useGuestMarketplaceOrder(
    sessionToken,
    createdOrder?.id,
    {
      enabled: Boolean(createdOrder?.id),
      refetchInterval: (query) => {
        const queryOrder = query.state.data as MarketplaceOrder | undefined;
        const effectiveOrder = queryOrder ?? createdOrder;
        const currentPStatus = effectiveOrder?.payment?.status;
        const currentOStatus = effectiveOrder?.status;
        return shouldPollLocalMateOrder(isOpen, createdOrder?.id, currentPStatus, currentOStatus)
          ? 2000
          : false;
      },
    }
  );

  const currentOrder = latestOrder ?? createdOrder;
  const currentPayment: LocalMateOrderPayment | undefined =
    currentOrder?.payment ?? undefined;

  const activeCheckoutUrl = currentPayment?.checkoutUrl ?? null;

  // Authoritative financial breakdown from payment snapshot
  const displayTourTotal = currentPayment?.tourTotalAmount
    ? formatMonetaryVnd(currentPayment.tourTotalAmount)
    : formatMonetaryVnd(tourTotalNumber);

  const displayPlatformFee = currentPayment?.platformFeeAmount !== undefined
    ? formatMonetaryVnd(currentPayment.platformFeeAmount)
    : null;

  const displayGuideRemaining = currentPayment?.guideRemainingAmount !== undefined
    ? formatMonetaryVnd(currentPayment.guideRemainingAmount)
    : null;

  const feeRatePercentage = currentPayment?.platformFeeRateSnapshot
    ? `${parseFloat(currentPayment.platformFeeRateSnapshot)}%`
    : null;

  if (!isOpen || !action) return null;

  // Step 1: Create booking order & payment snapshot
  const handleStep1Submit = async (e: React.FormEvent) => {
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
    } catch {
      setErrorMsg(copy.providerUnavailable);
    }
  };

  // Step 2: Explicit user action to create Stripe payment session and QR
  const handleCreatePaymentSession = async () => {
    if (!currentOrder?.id) return;
    setErrorMsg(null);
    setIsCreatingSession(true);

    try {
      const res = await paymentSessionMutation.mutateAsync({
        orderId: currentOrder.id,
      });
      if (res && "payment" in res && res.payment) {
        setCreatedOrder((prev) =>
          prev ? { ...prev, payment: res.payment } : prev
        );
      }
    } catch {
      setErrorMsg(copy.providerUnavailable);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Session retry reuses the same order, never creates a duplicate order
  const handleRetryPaymentSession = async () => {
    await handleCreatePaymentSession();
  };

  const handleCancelOrder = async () => {
    if (!currentOrder?.id) return;
    try {
      await cancelOrderMutation.mutateAsync({ orderId: currentOrder.id });
    } catch {
      setErrorMsg("Không thể huỷ yêu cầu.");
    }
  };

  const handleModalClose = () => {
    setCreatedOrder(null);
    setErrorMsg(null);
    setIsCreatingSession(false);
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
            aria-label={copy.close}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
          >
            <VsIcon name="x" className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {errorMsg}
          </div>
        )}

        {/* State 1: Order created with Snapshot review or Payment session flow */}
        {currentOrder ? (
          <div className="mt-5 space-y-4">
            {/* Order header indicator */}
            <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3.5 py-2 text-xs dark:bg-neutral-800/50">
              <span className="font-medium text-neutral-600 dark:text-neutral-400">
                {copy.orderNumber}
                <strong className="font-mono text-neutral-900 dark:text-neutral-100">
                  {currentOrder.orderNumber}
                </strong>
              </span>
              <span className="rounded-full bg-neutral-200/80 px-2 py-0.5 font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                {currentPayment?.status || currentOrder.status}
              </span>
            </div>

            {/* Authoritative backend snapshot review breakdown */}
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-neutral-500">
                  <span>{copy.tourTotal}</span>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {displayTourTotal}
                  </span>
                </div>
                {displayPlatformFee !== null && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>
                      {copy.platformFee}
                      {feeRatePercentage ? ` (${feeRatePercentage})` : ""}
                    </span>
                    <span className="font-bold">{displayPlatformFee}</span>
                  </div>
                )}
                {displayGuideRemaining !== null && (
                  <div className="flex justify-between border-t border-neutral-200/60 pt-1.5 text-neutral-500 dark:border-neutral-700/60">
                    <span>{copy.guideRemaining}</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {displayGuideRemaining}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-state A: Snapshot review ready - requires explicit 2nd step confirmation */}
            {!activeCheckoutUrl &&
              !isCreatingSession &&
              currentPayment?.status !== "PAID" &&
              currentPayment?.status !== "NOT_REQUIRED" &&
              currentPayment?.status !== "EXPIRED" &&
              currentPayment?.status !== "CANCELLED" &&
              currentPayment?.status !== "FAILED" &&
              currentPayment?.status !== "REFUND_PENDING" &&
              currentPayment?.status !== "REFUNDED" &&
              currentPayment?.status !== "DISPUTED" &&
              currentOrder.status !== "CANCELLED" &&
              currentOrder.status !== "REJECTED" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <VsIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{copy.policyNotice}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreatePaymentSession}
                    disabled={isCreatingSession || paymentSessionMutation.isPending}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    <VsIcon name="qr-code" className="h-4 w-4" />
                    {copy.confirmAndCreateQr}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleCancelOrder}
                      disabled={cancelOrderMutation.isPending}
                      className="text-xs text-neutral-500 hover:text-red-600"
                    >
                      {cancelOrderMutation.isPending ? copy.cancelling : copy.cancelRequest}
                    </button>
                  </div>
                </div>
              )}

            {/* Sub-state B: Payment session CREATING */}
            {(isCreatingSession || currentPayment?.status === "CREATING") && !activeCheckoutUrl && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 text-center dark:border-emerald-950 dark:bg-emerald-950/20">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <VsIcon name="loader" className="h-6 w-6 animate-spin" />
                </div>
                <h4 className="mt-3 text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {copy.creatingSession}
                </h4>
                <p className="mt-1 text-xs text-neutral-500">{copy.statusCreatingDesc}</p>
              </div>
            )}

            {/* Sub-state C: Payment OPEN with QR & direct Pay Now link */}
            {!isCreatingSession &&
              activeCheckoutUrl &&
              currentPayment?.status !== "PAID" &&
              currentPayment?.status !== "NOT_REQUIRED" &&
              currentPayment?.status !== "EXPIRED" &&
              currentPayment?.status !== "CANCELLED" &&
              currentPayment?.status !== "FAILED" && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <h4 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {copy.scanQrTitle}
                  </h4>
                  <p className="mt-1 text-xs text-neutral-500">{copy.statusOpenDesc}</p>

                  {/* QR Code Container */}
                  <div
                    data-testid="qr-container"
                    className="mx-auto mt-4 flex w-fit items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700"
                  >
                    <QRCodeSVG
                      value={activeCheckoutUrl}
                      size={180}
                      level="M"
                      includeMargin={true}
                      aria-label={copy.scanQrTitle}
                    />
                  </div>

                  {/* Phone notice for users on mobile */}
                  <p className="mx-auto mt-3 max-w-xs text-xs text-neutral-500">
                    {copy.qrPhoneNotice}
                  </p>

                  {/* Direct Pay now link */}
                  <a
                    href={activeCheckoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="pay-now-link"
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <VsIcon name="external-link" className="h-4 w-4" />
                    {copy.payNow}
                  </a>

                  {/* Polling live feedback indicator */}
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-neutral-500">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{copy.autoUpdating}</span>
                  </div>

                  {/* Cancel button */}
                  <div className="mt-4 border-t border-neutral-200/60 pt-3 dark:border-neutral-700/60">
                    <button
                      type="button"
                      onClick={handleCancelOrder}
                      disabled={cancelOrderMutation.isPending}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-neutral-900 dark:text-red-400"
                    >
                      <VsIcon name="x-circle" className="h-4 w-4" />
                      {cancelOrderMutation.isPending ? copy.cancelling : copy.cancelRequest}
                    </button>
                  </div>
                </div>
              )}

            {/* Sub-state D: PAID or NOT_REQUIRED */}
            {(currentPayment?.status === "PAID" ||
              currentPayment?.status === "NOT_REQUIRED") && (
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <VsIcon name="check-circle" className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-base font-bold text-emerald-900 dark:text-emerald-200">
                  {currentPayment?.status === "PAID" ? copy.statusPaid : copy.statusPendingAck}
                </h4>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  {currentPayment?.status === "PAID"
                    ? copy.statusPaidDesc
                    : copy.statusPendingAckDesc}
                </p>

                {currentOrder.status === "ACKNOWLEDGED" && (
                  <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-emerald-800 dark:bg-neutral-900/50 dark:text-emerald-300">
                    <strong>{copy.statusAck}</strong> — {copy.statusAckDesc}
                  </div>
                )}

                {currentOrder.status === "ACKNOWLEDGED" && onOpenChat && (
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

                <button
                  type="button"
                  onClick={handleModalClose}
                  className="mt-3 inline-flex min-h-[36px] items-center justify-center rounded-xl bg-neutral-200 px-4 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {copy.close}
                </button>
              </div>
            )}

            {/* Sub-state E: EXPIRED */}
            {currentPayment?.status === "EXPIRED" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center dark:border-amber-900/40 dark:bg-amber-950/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
                  <VsIcon name="clock" className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-base font-bold text-amber-900 dark:text-amber-200">
                  {copy.statusExpired}
                </h4>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {copy.statusExpiredDesc}
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleRetryPaymentSession}
                    disabled={isCreatingSession || paymentSessionMutation.isPending}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <VsIcon name="refresh-cw" className="h-4 w-4" />
                    {isCreatingSession || paymentSessionMutation.isPending
                      ? copy.retryingPayment
                      : copy.retryPayment}
                  </button>
                  <button
                    type="button"
                    onClick={handleModalClose}
                    className="inline-flex min-h-[40px] items-center rounded-xl bg-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {copy.close}
                  </button>
                </div>
              </div>
            )}

            {/* Sub-state F: FAILED or CANCELLED */}
            {(currentPayment?.status === "FAILED" ||
              currentPayment?.status === "CANCELLED" ||
              currentOrder.status === "CANCELLED") && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  <VsIcon name="alert-circle" className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {currentPayment?.status === "FAILED"
                    ? copy.statusFailed
                    : copy.statusCancelled}
                </h4>
                <p className="mt-1 text-xs text-neutral-500">
                  {currentPayment?.status === "FAILED"
                    ? copy.statusFailedDesc
                    : copy.statusCancelled}
                </p>
                {currentPayment?.status === "FAILED" && currentOrder.status !== "CANCELLED" && (
                  <button
                    type="button"
                    onClick={handleRetryPaymentSession}
                    disabled={isCreatingSession || paymentSessionMutation.isPending}
                    className="mt-4 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <VsIcon name="refresh-cw" className="h-4 w-4" />
                    {isCreatingSession || paymentSessionMutation.isPending
                      ? copy.retryingPayment
                      : copy.retryPayment}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="mt-3 inline-flex min-h-[36px] items-center rounded-xl bg-neutral-200 px-4 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {copy.close}
                </button>
              </div>
            )}

            {/* Sub-state G: REJECTED by guide */}
            {currentOrder.status === "REJECTED" && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
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

            {/* Sub-state H: REFUND_PENDING or REFUNDED */}
            {(currentPayment?.status === "REFUND_PENDING" ||
              currentPayment?.status === "REFUNDED") && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 text-center dark:border-sky-900/40 dark:bg-sky-950/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400">
                  <VsIcon
                    name={currentPayment.status === "REFUND_PENDING" ? "clock" : "check-circle"}
                    className="h-6 w-6"
                  />
                </div>
                <h4 className="mt-3 text-base font-bold text-sky-900 dark:text-sky-200">
                  {currentPayment.status === "REFUND_PENDING"
                    ? copy.statusRefundPending
                    : copy.statusRefunded}
                </h4>
                <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                  {currentPayment.status === "REFUND_PENDING"
                    ? copy.statusRefundPendingDesc
                    : copy.statusRefundedDesc}
                </p>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="mt-4 inline-flex min-h-[36px] items-center rounded-xl bg-neutral-200 px-4 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {copy.close}
                </button>
              </div>
            )}

            {/* Sub-state I: DISPUTED */}
            {currentPayment?.status === "DISPUTED" && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-center dark:border-rose-900/40 dark:bg-rose-950/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
                  <VsIcon name="shield-alert" className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-base font-bold text-rose-900 dark:text-rose-200">
                  {copy.statusDisputed}
                </h4>
                <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                  {copy.statusDisputedDesc}
                </p>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="mt-4 inline-flex min-h-[36px] items-center rounded-xl bg-neutral-200 px-4 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {copy.close}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* State 2: Step 1 Booking Request Form (creates snapshot without hardcoded 15% breakdown) */
          <form onSubmit={handleStep1Submit} className="mt-4 space-y-4">
            {/* Guide & Service summary */}
            <div className="rounded-2xl bg-neutral-50 p-3.5 dark:bg-neutral-800/40">
              <div className="text-xs text-neutral-500">{copy.service}</div>
              <div className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-100">
                {action.service.name}
              </div>

              {/* Authoritative tour price only (no client arithmetic fee) */}
              <div className="mt-2 flex justify-between border-t border-neutral-200/60 pt-2 text-xs dark:border-neutral-700/60">
                <span className="text-neutral-600 dark:text-neutral-400">{copy.tourTotal}</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {displayTourTotal}
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

            {/* Step 1 notice: VietSage will confirm and lock the fee breakdown for review before payment */}
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <VsIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{copy.step1FeeNotice}</span>
            </div>

            {/* Step 1 Submit button */}
            <button
              type="submit"
              disabled={createOrderMutation.isPending}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              <VsIcon name="send" className="h-4 w-4" />
              {createOrderMutation.isPending ? copy.step1Submitting : copy.step1SubmitBtn}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
