"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { DEFAULT_LOCALE, LOCALE_OPTIONS, normalizeLocale, type SupportedLocale } from "@/core/i18n/locales";
import {
  getLocalMateChatUiText,
  getLocalMateNetworkErrorReply,
  getLocalMatePublicCopy,
  getLocalMateWelcomeMessage,
} from "@/features/localmate-chat/localmate-chat-copy";
import { publicLocalMateResource } from "../resource";
import { publicLocalMateRepository } from "../repository";
import {
  canProceedToBooking,
  transitionStage,
  type PublicBookingCandidate,
  type PublicConversationMessage,
  type PublicLocalMateAction,
  type PublicLocalMateActionType,
  type PublicLocalMateProposal,
  type PublicLocalMateSelection,
  type PublicLocalMateStage,
  type PublicLocalMateSuggestion,
  type PublicOrder,
} from "../types";
import { useLocalMateSessionStore } from "../store/localmate-session-store";
import {
  getLocalizedDestinations,
} from "../constants/locations";

type Message = {
  id: number;
  sender: "guest" | "localmate";
  text: string;
  candidateKey?: string;
  stage?: PublicLocalMateStage;
  proposals?: PublicLocalMateProposal[];
  actions?: PublicLocalMateAction[];
};

type LocalChatMessage = PublicConversationMessage & {
  retryCount?: number;
};

function createIdempotencyKey(): string {
  return `ord_${crypto.randomUUID()}`;
}

function createClientMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}

function createBookingFingerprint(
  candidateKey: string,
  location: string,
  guestDisplayName: string,
  guestPhone: string,
  proposalKey?: string,
): string {
  return JSON.stringify([candidateKey, proposalKey ?? "", location, guestDisplayName, guestPhone]);
}

function renderInlineFormatting(text: string, isGuest: boolean) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong
          key={index}
          className={`font-bold ${isGuest ? "text-[#f3c66b]" : "text-[#123d2a]"}`}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className={`mx-0.5 rounded px-1 py-0.5 font-mono text-[12px] font-semibold ${
            isGuest ? "bg-white/15 text-white" : "bg-black/5 text-[#123d2a]"
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={index} className="italic opacity-90">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

function renderMessageContent(text: string, isGuest: boolean) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 [overflow-wrap:anywhere] break-words">
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <span key={lineIndex} className="block h-1.5" />;
        }

        const bulletMatch = trimmed.match(/^([-•*]|\d+[.)])\s+(.*)$/);
        if (bulletMatch) {
          const body = bulletMatch[2];
          const landmarkMatch = body.match(/^(\*{0,2})([^:\n*]{2,70})(\*{0,2})\s*:\s*(.*)$/);

          if (landmarkMatch && !isGuest) {
            const rawTitle = landmarkMatch[2].trim();
            const rest = landmarkMatch[4];

            return (
              <div key={lineIndex} className="my-1 flex items-start gap-2 pl-0.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#123d2a]/60" />
                <div className="flex-1 leading-relaxed text-[#24342b]">
                  <strong className="font-bold text-[#123d2a]">{rawTitle}</strong>
                  <span className="font-medium text-[#123d2a]">:</span>{" "}
                  <span>{renderInlineFormatting(rest, isGuest)}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={lineIndex} className="my-1 flex items-start gap-2 pl-0.5">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  isGuest ? "bg-[#f3c66b]" : "bg-[#b8872f]"
                }`}
              />
              <div className="flex-1 leading-relaxed">
                {renderInlineFormatting(body, isGuest)}
              </div>
            </div>
          );
        }

        return (
          <p key={lineIndex} className="leading-relaxed">
            {renderInlineFormatting(line, isGuest)}
          </p>
        );
      })}
    </div>
  );
}

export interface PublicLocalMateChatProps {
  locale?: SupportedLocale;
  onLocaleChange?: (locale: SupportedLocale) => void;
}

const ORDER_FORM_TEXT: Record<SupportedLocale, {
  loadingTour: string;
  nativeExperience: string;
  defaultServiceName: string;
  listedPrice: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  partySizeLabel: string;
  guestCount: (n: number) => string;
  phoneLabel: string;
  phonePlaceholder: string;
  chatTip: string;
  creatingOrder: string;
  retryPayment: string;
  confirmAndPay: string;
  reviewInfo: string;
}> = {
  vi: {
    loadingTour: "Đang lấy thông tin tour...",
    nativeExperience: "Trải nghiệm bản địa",
    defaultServiceName: "Dịch vụ LocalMate đồng hành",
    listedPrice: "Giá niêm yết",
    fullNameLabel: "Họ và tên của Quý khách",
    fullNamePlaceholder: "Ví dụ: Nguyễn Văn A",
    partySizeLabel: "Số lượng khách",
    guestCount: (n) => `${n} khách`,
    phoneLabel: "Số điện thoại liên hệ",
    phonePlaceholder: "Ví dụ: 0901234567",
    chatTip: "Sau khi thanh toán qua mã QR, Quý khách và Hướng dẫn viên sẽ nhắn tin trực tiếp để hẹn giờ và điểm đón thuận tiện nhất.",
    creatingOrder: "Đang tạo đơn...",
    retryPayment: "Thử lại thanh toán",
    confirmAndPay: "Xác nhận & Đi đến thanh toán",
    reviewInfo: "Kiểm tra thông tin",
  },
  en: {
    loadingTour: "Loading tour details...",
    nativeExperience: "Native Experience",
    defaultServiceName: "LocalMate Companion Service",
    listedPrice: "Listed Price",
    fullNameLabel: "Full Name",
    fullNamePlaceholder: "e.g. John Doe",
    partySizeLabel: "Number of Guests",
    guestCount: (n) => `${n} ${n === 1 ? "guest" : "guests"}`,
    phoneLabel: "Contact Phone Number",
    phonePlaceholder: "e.g. +84 901234567",
    chatTip: "After completing payment via QR code, you and your Guide can chat directly to arrange pickup time and location.",
    creatingOrder: "Creating order...",
    retryPayment: "Retry payment",
    confirmAndPay: "Confirm & Proceed to Payment",
    reviewInfo: "Review Details",
  },
  zh: {
    loadingTour: "正在获取行程信息...",
    nativeExperience: "原生态体验",
    defaultServiceName: "LocalMate 专属向导服务",
    listedPrice: "标牌价",
    fullNameLabel: "您的姓名",
    fullNamePlaceholder: "例如：张三",
    partySizeLabel: "出行人数",
    guestCount: (n) => `${n} 位游客`,
    phoneLabel: "联系电话",
    phonePlaceholder: "例如：+86 13800138000",
    chatTip: "扫码支付完成后，您将与当地向导直接在线沟通，敲定最便利的接送时间与地点。",
    creatingOrder: "正在生成订单...",
    retryPayment: "重试支付",
    confirmAndPay: "确认并前往支付",
    reviewInfo: "核对信息",
  },
  ko: {
    loadingTour: "투어 정보를 불러오는 중...",
    nativeExperience: "로컬 체험",
    defaultServiceName: "LocalMate 동행 서비스",
    listedPrice: "정가",
    fullNameLabel: "예약자 성함",
    fullNamePlaceholder: "예: 홍길동",
    partySizeLabel: "인원 수",
    guestCount: (n) => `${n}명`,
    phoneLabel: "연락처",
    phonePlaceholder: "예: 010-1234-5678",
    chatTip: "QR 결제 완료 후 현지 가이드와 1:1 대화로 가장 편한 미팅 시간과 장소를 조율하실 수 있습니다.",
    creatingOrder: "주문 생성 중...",
    retryPayment: "결제 다시 시도",
    confirmAndPay: "확인 및 결제 진행",
    reviewInfo: "정보 확인",
  },
  ru: {
    loadingTour: "Загрузка информации о туре...",
    nativeExperience: "Местный опыт",
    defaultServiceName: "Сопровождение с LocalMate",
    listedPrice: "Цена",
    fullNameLabel: "Ваше имя и фамилия",
    fullNamePlaceholder: "Например: Иван Иванов",
    partySizeLabel: "Количество гостей",
    guestCount: (n) => `${n} чел.`,
    phoneLabel: "Номер телефона",
    phonePlaceholder: "Например: +7 999 123-45-67",
    chatTip: "После оплаты через QR-код вы сможете напрямую связаться с гидом для согласования времени и места встречи.",
    creatingOrder: "Создание заказа...",
    retryPayment: "Повторить оплату",
    confirmAndPay: "Подтвердить и оплатить",
    reviewInfo: "Проверить детали",
  },
  hi: {
    loadingTour: "टूर विवरण लोड हो रहा है...",
    nativeExperience: "स्थानीय अनुभव",
    defaultServiceName: "LocalMate सहयात्री सेवा",
    listedPrice: "सूचीबद्ध मूल्य",
    fullNameLabel: "आपका पूरा नाम",
    fullNamePlaceholder: "उदा: राहुल शर्मा",
    partySizeLabel: "अतिथियों की संख्या",
    guestCount: (n) => `${n} अतिथि`,
    phoneLabel: "फ़ोन नंबर",
    phonePlaceholder: "उदा: +91 9876543210",
    chatTip: "QR कोड से भुगतान करने के बाद, आप और आपके गाइड सीधे चैट करके सुविधाजनक समय और स्थान तय कर सकते हैं।",
    creatingOrder: "ऑर्डर तैयार किया जा रहा है...",
    retryPayment: "पुनः भुगतान करें",
    confirmAndPay: "पुष्टि करें और भुगतान करें",
    reviewInfo: "जानकारी जांचें",
  },
};

const PAYMENT_VIEW_TEXT: Record<SupportedLocale, {
  orderCode: string;
  guestsCount: (n: number) => string;
  totalCost: string;
  depositFee: string;
  remainingFee: string;
  qrInstruction: string;
  openStripeLink: string;
  initializingGateway: string;
  pollingPayment: string;
  backToDiscovery: string;
}> = {
  vi: {
    orderCode: "Mã đơn:",
    guestsCount: (n) => `${n} khách`,
    totalCost: "Tổng chi phí:",
    depositFee: "Cọc VietSage:",
    remainingFee: "Gửi hướng dẫn viên:",
    qrInstruction: "Quét mã QR để thanh toán",
    openStripeLink: "Mở cổng thanh toán Stripe",
    initializingGateway: "Đang kết nối cổng thanh toán...",
    pollingPayment: "Đang chờ xác nhận giao dịch...",
    backToDiscovery: "Quay lại khám phá",
  },
  en: {
    orderCode: "Order #:",
    guestsCount: (n) => `${n} ${n === 1 ? "guest" : "guests"}`,
    totalCost: "Total:",
    depositFee: "VietSage deposit:",
    remainingFee: "Pay to guide:",
    qrInstruction: "Scan QR code to pay",
    openStripeLink: "Proceed to checkout",
    initializingGateway: "Connecting to payment gateway...",
    pollingPayment: "Awaiting confirmation...",
    backToDiscovery: "Back to discovery",
  },
  zh: {
    orderCode: "订单编号：",
    guestsCount: (n) => `${n} 位出行人`,
    totalCost: "行程总额：",
    depositFee: "VietSage 定金：",
    remainingFee: "现场交付向导：",
    qrInstruction: "扫描二维码支付",
    openStripeLink: "前往支付页面",
    initializingGateway: "正在连接支付网关...",
    pollingPayment: "正在确认交易...",
    backToDiscovery: "返回探索",
  },
  ko: {
    orderCode: "예약 번호:",
    guestsCount: (n) => `${n}인`,
    totalCost: "총 금액:",
    depositFee: "VietSage 예약금:",
    remainingFee: "가이드 현장 결제:",
    qrInstruction: "QR 코드로 결제",
    openStripeLink: "결제 페이지로 이동",
    initializingGateway: "결제 게이트웨이 연결 중...",
    pollingPayment: "결제 확인 대기 중...",
    backToDiscovery: "탐색으로 돌아가기",
  },
  ru: {
    orderCode: "Номер заказа:",
    guestsCount: (n) => `${n} ${n === 1 ? "гость" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "гостя" : "гостей"}`,
    totalCost: "Итого:",
    depositFee: "Депозит VietSage:",
    remainingFee: "К оплате гиду:",
    qrInstruction: "Отсканируйте QR для оплаты",
    openStripeLink: "Перейти к оплате",
    initializingGateway: "Подключение к платежу...",
    pollingPayment: "Подтверждение оплаты...",
    backToDiscovery: "Назад к поиску",
  },
  hi: {
    orderCode: "ऑर्डर संख्या:",
    guestsCount: (n) => `${n} यात्री`,
    totalCost: "कुल राशि:",
    depositFee: "VietSage जमा:",
    remainingFee: "गाइड को देय:",
    qrInstruction: "भुगतान के लिए QR स्कैन करें",
    openStripeLink: "भुगतान पेज पर जाएं",
    initializingGateway: "भुगतान से जुड़ रहे हैं...",
    pollingPayment: "पुष्टि की प्रतीक्षा...",
    backToDiscovery: "खोज पर वापस जाएं",
  },
};

const GUIDE_CHAT_VIEW_TEXT: Record<SupportedLocale, {
  completedBanner: string;
  connectedBanner: string;
  emptyMessages: string;
}> = {
  vi: {
    completedBanner: "🏁 Buổi trải nghiệm đã hoàn tất. Cảm ơn quý khách đã tin tưởng và đồng hành cùng VietSage LocalMate!",
    connectedBanner: "✓ Đã hoàn tất thanh toán. Quý khách đang kết nối trực tiếp với Hướng dẫn viên bản địa!",
    emptyMessages: "Chưa có tin nhắn. Quý khách hãy gửi lời chào hoặc địa điểm đón tiếp.",
  },
  en: {
    completedBanner: "🏁 Tour completed. Thank you for traveling with VietSage LocalMate!",
    connectedBanner: "✓ Payment confirmed. You are now connected directly with your local Guide!",
    emptyMessages: "No messages yet. Say hello or share your preferred pickup location here.",
  },
  zh: {
    completedBanner: "🏁 行程已圆满结束。感谢您选择 VietSage LocalMate！",
    connectedBanner: "✓ 支付已确认。您已成功与当地向导建立直接联系！",
    emptyMessages: "暂无消息。您可以在此向向导发送问候或约定接送地点。",
  },
  ko: {
    completedBanner: "🏁 투어가 완료되었습니다. VietSage LocalMate와 함께해 주셔서 감사합니다!",
    connectedBanner: "✓ 결제가 완료되었습니다. 현지 로컬 가이드와 1:1 대화 중입니다!",
    emptyMessages: "아직 메시지가 없습니다. 인사말이나 만날 장소를 남겨주세요.",
  },
  ru: {
    completedBanner: "🏁 Тур завершен. Благодарим за путешествие с VietSage LocalMate!",
    connectedBanner: "✓ Оплата подтверждена. Вы на прямой связи с местным гидом!",
    emptyMessages: "Сообщений пока нет. Поприветствуйте гида или укажите место встречи.",
  },
  hi: {
    completedBanner: "🏁 टूर पूरा हो गया है। VietSage LocalMate के साथ यात्रा करने के लिए धन्यवाद!",
    connectedBanner: "✓ भुगतान की पुष्टि हो गई। अब आप सीधे अपने स्थानीय गाइड से जुड़े हैं!",
    emptyMessages: "अभी कोई संदेश नहीं है। गाइड को नमस्ते कहें या पिकअप स्थान बताएं।",
  },
};

export function PublicLocalMateChat({
  locale = DEFAULT_LOCALE,
  onLocaleChange,
}: PublicLocalMateChatProps = {}) {
  const normalizedPropLocale = normalizeLocale(locale);
  const [internalLocale, setInternalLocale] = useState<SupportedLocale>(normalizedPropLocale);
  const [prevPropLocale, setPrevPropLocale] = useState<SupportedLocale>(normalizedPropLocale);

  if (normalizedPropLocale !== prevPropLocale) {
    setPrevPropLocale(normalizedPropLocale);
    setInternalLocale(normalizedPropLocale);
  }

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langMenuOpen]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = internalLocale;
    }
  }, [internalLocale]);

  const effectiveLocale = internalLocale;
  const currentOption = useMemo(
    () => LOCALE_OPTIONS.find((o) => o.code === effectiveLocale) ?? LOCALE_OPTIONS[0],
    [effectiveLocale],
  );

  const publicCopy = useMemo(() => getLocalMatePublicCopy(effectiveLocale), [effectiveLocale]);
  const chatUi = useMemo(() => getLocalMateChatUiText(effectiveLocale), [effectiveLocale]);
  const orderFormText = useMemo(() => ORDER_FORM_TEXT[effectiveLocale] ?? ORDER_FORM_TEXT.vi, [effectiveLocale]);
  const paymentViewText = useMemo(() => PAYMENT_VIEW_TEXT[effectiveLocale] ?? PAYMENT_VIEW_TEXT.vi, [effectiveLocale]);
  const guideChatViewText = useMemo(() => GUIDE_CHAT_VIEW_TEXT[effectiveLocale] ?? GUIDE_CHAT_VIEW_TEXT.vi, [effectiveLocale]);

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    setInternalLocale(newLocale);
    onLocaleChange?.(newLocale);
  };

  const chatMutation = useMutation(publicLocalMateResource.bind({}).mutations.chat.options());

  // Persistent session state from Zustand
  const isOpen = useLocalMateSessionStore((s) => s.isOpen);
  const setIsOpen = useLocalMateSessionStore((s) => s.setIsOpen);
  const viewMode = useLocalMateSessionStore((s) => s.viewMode);
  const setViewMode = useLocalMateSessionStore((s) => s.setViewMode);
  const currentStage = useLocalMateSessionStore((s) => s.stage);
  const setCurrentStage = useLocalMateSessionStore((s) => s.setStage);
  const activeProposalKey = useLocalMateSessionStore((s) => s.activeProposalKey);
  const setActiveProposalKey = useLocalMateSessionStore((s) => s.setActiveProposalKey);
  const activeCandidateKey = useLocalMateSessionStore((s) => s.activeCandidateKey);
  const setActiveCandidateKey = useLocalMateSessionStore((s) => s.setActiveCandidateKey);
  const setActiveOrderId = useLocalMateSessionStore((s) => s.setActiveOrderId);
  const openGuideChat = useLocalMateSessionStore((s) => s.openGuideChat);
  const openPayment = useLocalMateSessionStore((s) => s.openPayment);
  const resetSession = useLocalMateSessionStore((s) => s.resetSession);
  const setLastChatUrl = useLocalMateSessionStore((s) => s.setLastChatUrl);

  const [location, setLocation] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 0,
      sender: "localmate",
      text: getLocalMateWelcomeMessage(effectiveLocale),
    },
  ]);
  const [suggestions, setSuggestions] = useState<PublicLocalMateSuggestion[]>([]);
  const [locationError, setLocationError] = useState("");

  const chatInputPlaceholder = useMemo(() => {
    if (!location) return chatUi.placeholder;
    switch (effectiveLocale) {
      case "en":
        return `Ask about ${location}…`;
      case "zh":
        return `咨询关于 ${location}…`;
      case "ko":
        return `${location}에 대해 질문하기…`;
      case "ru":
        return `Спросите о ${location}…`;
      case "hi":
        return `${location} के बारे में पूछें…`;
      default:
        return `Hỏi về ${location}…`;
    }
  }, [location, effectiveLocale, chatUi.placeholder]);

  // Proposal state
  const [activeProposals, setActiveProposals] = useState<PublicLocalMateProposal[]>([]);

  // Booking & Confirmation state
  const [candidateDetails, setCandidateDetails] = useState<PublicBookingCandidate | null>(null);
  const [isLoadingCandidate, setIsLoadingCandidate] = useState(false);
  const [bookingPreviewFingerprint, setBookingPreviewFingerprint] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [bookingError, setBookingError] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Payment state
  const [currentOrder, setCurrentOrder] = useState<PublicOrder | null>(null);
  const [paymentCheckoutUrl, setPaymentCheckoutUrl] = useState<string | null>(null);
  const isPollingPayment = viewMode === "payment" && Boolean(currentOrder?.id);

  // Guide Chat state
  const [conversationMessages, setConversationMessages] = useState<LocalChatMessage[]>([]);
  const [guideInput, setGuideInput] = useState("");
  const [isSendingGuideMessage, setIsSendingGuideMessage] = useState(false);

  const activeProposal = useMemo(
    () => activeProposals.find((p) => p.proposalKey === activeProposalKey) ?? null,
    [activeProposals, activeProposalKey],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const teaserRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const openerKindRef = useRef<"teaser" | "button">("button");
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const guideChatEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const currentBookingFingerprint = activeCandidateKey
    ? createBookingFingerprint(
        activeCandidateKey,
        location || "Toàn quốc",
        guestDisplayName.trim(),
        guestPhone.trim(),
        activeProposalKey ?? undefined,
      )
    : "";
  const isCandidatePreviewCurrent =
    Boolean(candidateDetails) && bookingPreviewFingerprint === currentBookingFingerprint;

  const closeChat = useCallback(() => setIsOpen(false), [setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    if (isMobile) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Capture the opener once per open/close transition (LM-10).
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      lastFocusedElementRef.current = (document.activeElement as HTMLElement) ?? null;
    } else if (
      !isOpen &&
      wasOpenRef.current &&
      lastFocusedElementRef.current &&
      typeof lastFocusedElementRef.current.focus === "function"
    ) {
      lastFocusedElementRef.current.focus();
    } else if (!isOpen && wasOpenRef.current) {
      (openerKindRef.current === "teaser" ? teaserRef.current : openButtonRef.current)?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Focus the current view without overwriting the captured opener.
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      if (viewMode === "discovery" && inputRef.current) {
        inputRef.current.focus();
        return;
      }
      const container = dialogRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
      focusables[0]?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, viewMode]);

  // Tab containment and Escape handling (LM-10)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeChat();
        return;
      }

      if (event.key === "Tab") {
        const container = dialogRef.current;
        if (!container) return;

        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !container.contains(document.activeElement)) {
            event.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last || !container.contains(document.activeElement)) {
            event.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeChat, isOpen]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (guideChatEndRef.current) {
      guideChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationMessages]);

  // Session & Order restoration effect on mount (page reload or return from payment)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    const restoreSessionAndOrder = async () => {
      const session = useLocalMateSessionStore.getState();
      const urlOrderId = new URLSearchParams(window.location.search).get("orderId");
      const targetOrderId = urlOrderId || session.activeOrderId;

      let order: PublicOrder | null = null;

      if (targetOrderId) {
        try {
          order = await publicLocalMateRepository.getOrder(targetOrderId);
        } catch {
          order = null;
        }
      }

      if (!order) {
        try {
          const activeSession = await publicLocalMateRepository.getActiveSession();
          if (activeSession?.activeOrder) {
            order = activeSession.activeOrder;
          }
        } catch {
          // Ignored
        }
      }

      if (!isMounted || !order) return;

      setCurrentOrder(order);
      session.setIsOpen(true);
      session.setActiveOrderId(order.id);

      const isPaid =
        order.payment?.status === "PAID" ||
        order.payment?.status === "NOT_REQUIRED" ||
        order.status === "COMPLETED" ||
        order.status === "ACKNOWLEDGED";

      if (isPaid || session.viewMode === "guide-chat") {
        session.openGuideChat(order.id);
        try {
          const conv = await publicLocalMateRepository.getConversation(order.id);
          if (isMounted && conv?.items) {
            setConversationMessages(conv.items);
          }
        } catch {
          // Ignored
        }
      } else {
        session.openPayment(order.id);
        try {
          if (order.payment?.checkoutUrl) {
            setPaymentCheckoutUrl(order.payment.checkoutUrl);
          } else {
            const payRes = await publicLocalMateRepository.createPaymentSession(order.id);
            if (isMounted && payRes?.payment?.checkoutUrl) {
              setPaymentCheckoutUrl(payRes.payment.checkoutUrl);
            }
          }
        } catch {
          // Ignored
        }
      }
    };

    void restoreSessionAndOrder();

    return () => {
      isMounted = false;
    };
  }, []);

  // Payment polling effect: poll every 2000ms while on payment screen & listen to payment events
  useEffect(() => {
    if (viewMode !== "payment" || !currentOrder?.id) return;

    let isMounted = true;

    if (typeof window !== "undefined") {
      setLastChatUrl(window.location.href);
      setActiveOrderId(currentOrder.id);
    }

    const checkPaymentStatus = async () => {
      try {
        const updated = await publicLocalMateRepository.getOrder(currentOrder.id);
        if (!isMounted) return;

        setCurrentOrder(updated);

        const status = updated.payment?.status;
        if (status === "PAID" || status === "NOT_REQUIRED") {
          openGuideChat(currentOrder.id);
        }
      } catch {
        // Ignored in poll interval
      }
    };

    const pollInterval = setInterval(checkPaymentStatus, 2000);

    // Listen to postMessage from payment-return tab/popup (LM-03 same-origin check)
    const handleMessage = (e: MessageEvent) => {
      if (typeof window !== "undefined" && e.origin !== window.location.origin) return;
      if (e.data?.type === "LOCALMATE_PAYMENT_SUCCESS") {
        void checkPaymentStatus();
      }
    };

    // Immediate check when tab gets focus or becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkPaymentStatus();
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewMode, currentOrder?.id, openGuideChat, setActiveOrderId, setLastChatUrl]);

  // Guide Chat polling effect: poll conversation messages every 1200ms
  useEffect(() => {
    if (viewMode !== "guide-chat" || !currentOrder?.id) return;

    let isMounted = true;

    const fetchMessages = async () => {
      try {
        const conv = await publicLocalMateRepository.getConversation(currentOrder.id);
        if (isMounted && conv?.items) {
          setConversationMessages(conv.items);
          if (conv.status === "CLOSED" && currentOrder.status !== "COMPLETED") {
            const updated = await publicLocalMateRepository.getOrder(currentOrder.id);
            if (isMounted) setCurrentOrder(updated);
          }
        }
      } catch {
        // Ignored
      }
    };

    void fetchMessages();
    const interval = setInterval(fetchMessages, 1200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [viewMode, currentOrder?.id, currentOrder?.status]);

  const send = async (
    explicitText?: string,
    explicitLocation?: string,
    displayTextOverride?: string,
    explicitSelection?: { proposalKey?: string; candidateKey?: string },
    explicitActionType?: PublicLocalMateActionType,
  ) => {
    const rawText = (explicitText ?? input).trim();
    if (!rawText || chatMutation.isPending) return;

    const activeLocation = explicitLocation ?? location;
    const displayText = displayTextOverride ?? rawText;

    const userMessage: Message = { id: nextId.current++, sender: "guest", text: displayText };
    setMessages((current) => [...current, userMessage]);
    if (!explicitText) setInput("");

    try {
      const sanitizedHistory = messages
        .filter((m) => m.id !== 0 && Boolean(m.text && m.text.trim().length > 0))
        .slice(-6)
        .map((m) => ({
          role: m.sender,
          text: m.text.trim(),
        }));

      const selectionPayload: PublicLocalMateSelection = {
        proposalKey: explicitSelection?.proposalKey ?? activeProposalKey ?? undefined,
        candidateKey: explicitSelection?.candidateKey ?? activeCandidateKey ?? undefined,
      };

      const result = await chatMutation.mutateAsync({
        input: {
          message: rawText,
          location: activeLocation || undefined,
          language: effectiveLocale,
          history: sanitizedHistory,
          selection:
            selectionPayload.proposalKey || selectionPayload.candidateKey
              ? selectionPayload
              : undefined,
          actionType: explicitActionType,
        },
      });

      const candidateKey =
        result.action?.candidateKey ??
        (result.action?.type === "LOCALMATE_BOOKING" || result.action?.type === "SELECT_GUIDE"
          ? (result.action as { candidateKey?: string }).candidateKey
          : undefined);

      const serverProposals: PublicLocalMateProposal[] | undefined =
        result.proposals && result.proposals.length > 0 ? result.proposals : undefined;

      if (serverProposals && serverProposals.length > 0) {
        setActiveProposals(serverProposals);
      }

      if (result.stage) {
        setCurrentStage(result.stage);
      } else if (explicitActionType) {
        setCurrentStage(transitionStage(currentStage, explicitActionType));
      } else if (serverProposals && serverProposals.length > 0 && currentStage === "DISCOVERY") {
        setCurrentStage("PROPOSALS");
      }

      if (result.action?.proposalKey) {
        setActiveProposalKey(result.action.proposalKey);
      }

      const serverActions: PublicLocalMateAction[] | undefined =
        result.actions && result.actions.length > 0 ? result.actions : undefined;

      const guideAction = serverActions?.find((a) => a.type === "SELECT_GUIDE" && a.candidateKey);
      const effectiveCandidateKey = candidateKey ?? guideAction?.candidateKey;

      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          sender: "localmate",
          text: result.reply,
          candidateKey: effectiveCandidateKey,
          stage: result.stage,
          proposals: serverProposals,
          actions: serverActions,
        },
      ]);
      setSuggestions(result.suggestions ?? []);

      if (effectiveCandidateKey) {
        setActiveCandidateKey(effectiveCandidateKey);
      }
    } catch (err) {
      console.error("[LocalMateChat] send error:", err);
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          sender: "localmate",
          text: getLocalMateNetworkErrorReply(effectiveLocale),
        },
      ]);
    }
  };

  const handleSelectProposal = (key: string) => {
    setActiveProposalKey(key);
    setCurrentStage("GUIDE_SELECTION");
    const matched = activeProposals.find((p) => p.proposalKey === key);
    const title = matched?.title ?? "lịch trình này";
    const promptText =
      effectiveLocale === "en"
        ? `I select this itinerary: ${title}`
        : effectiveLocale === "zh"
          ? `我选择此行程：${title}`
          : effectiveLocale === "ko"
            ? `이 일정을 선택합니다: ${title}`
            : effectiveLocale === "ru"
              ? `Я выбираю этот маршрут: ${title}`
              : effectiveLocale === "hi"
                ? `मैं यह यात्रा कार्यक्रम चुनता हूँ: ${title}`
                : `Tôi chọn lịch trình này: ${title}`;
    const displayText =
      effectiveLocale === "en"
        ? `Select itinerary: ${title}`
        : effectiveLocale === "zh"
          ? `选择行程：${title}`
          : effectiveLocale === "ko"
            ? `일정 선택: ${title}`
            : effectiveLocale === "ru"
              ? `Выбран маршрут: ${title}`
              : effectiveLocale === "hi"
                ? `यात्रा कार्यक्रम चुनें: ${title}`
                : `Chọn lịch trình: ${title}`;
    void send(
      promptText,
      undefined,
      displayText,
      { proposalKey: key },
      "SELECT_PROPOSAL",
    );
  };

  const handleShowAlternatives = (key: string) => {
    setCurrentStage("DISCOVERY");
    const matched = activeProposals.find((p) => p.proposalKey === key);
    const loc = matched?.location || location || "khu vực";
    const promptText =
      effectiveLocale === "en"
        ? `I want to see alternative itineraries in ${loc}`
        : effectiveLocale === "zh"
          ? `我想查看 ${loc} 的其他行程方案`
          : effectiveLocale === "ko"
            ? `${loc}의 다른 추천 일정을 보고 싶습니다`
            : effectiveLocale === "ru"
              ? `Я хочу посмотреть другие варианты маршрутов в ${loc}`
              : effectiveLocale === "hi"
                ? `मैं ${loc} में वैकल्पिक यात्रा कार्यक्रम देखना चाहता हूँ`
                : `Tôi muốn xem các phương án lịch trình khác tại ${loc}`;
    void send(
      promptText,
      undefined,
      publicCopy.showAlternatives,
      { proposalKey: key },
      "SHOW_ALTERNATIVES",
    );
  };

  const handleSelectGuide = (candKey: string, propKey?: string) => {
    const targetPropKey = propKey || activeProposalKey;
    if (!targetPropKey) {
      setBookingError(publicCopy.selectProposalFirstError);
      return;
    }
    setActiveCandidateKey(candKey);
    handleStartBooking(candKey, targetPropKey);
  };

  const handleStartBooking = (candKey: string, propKey?: string) => {
    const targetPropKey = propKey || activeProposalKey;
    if (!candKey || !targetPropKey) {
      setBookingError(publicCopy.selectGuideFirstError);
      return;
    }
    setActiveCandidateKey(candKey);
    setActiveProposalKey(targetPropKey);
    setCurrentStage("BOOKING");
    setCandidateDetails(null);
    setBookingPreviewFingerprint("");
    setCurrentOrder(null);
    setPaymentCheckoutUrl(null);
    setIdempotencyKey(createIdempotencyKey());
    setBookingError("");
    setViewMode("confirm");

    setIsLoadingCandidate(true);
    publicLocalMateRepository
      .getCandidate(candKey, targetPropKey)
      .then((candidate) => {
        setCandidateDetails(candidate);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingCandidate(false);
      });
  };

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidateKey || !activeProposalKey) {
      setBookingError(publicCopy.selectGuideFirstError);
      return;
    }

    const name = guestDisplayName.trim();
    const phone = guestPhone.trim();
    if (!name || name.length < 2) {
      setBookingError(publicCopy.nameRequiredError);
      return;
    }
    if (!phone) {
      setBookingError(publicCopy.phoneRequiredError);
      return;
    }
    if (!/^\+?[0-9][0-9 .()-]{5,30}$/.test(phone)) {
      setBookingError(publicCopy.phoneFormatError);
      return;
    }

    setBookingError("");
    setIsSubmittingOrder(true);

    try {
      const fingerprint = createBookingFingerprint(
        activeCandidateKey,
        location || "Toàn quốc",
        name,
        phone,
        activeProposalKey,
      );
      if (!candidateDetails || bookingPreviewFingerprint !== fingerprint) {
        setIsLoadingCandidate(true);
        setCurrentOrder(null);
        await publicLocalMateRepository.createSession({
          location: location || "Toàn quốc",
          guestDisplayName: name,
          guestPhone: phone,
        });
        const candidate = await publicLocalMateRepository.getCandidate(
          activeCandidateKey,
          activeProposalKey,
        );
        setCandidateDetails(candidate);
        setBookingPreviewFingerprint(fingerprint);
        setIsLoadingCandidate(false);
      }

      let key = idempotencyKey;
      if (!key) {
        key = createIdempotencyKey();
        setIdempotencyKey(key);
      }

      const order =
        currentOrder ??
        (await publicLocalMateRepository.createOrder({
          candidateKey: activeCandidateKey,
          proposalKey: activeProposalKey,
          partySize,
          idempotencyKey: key,
        }));

      if (!currentOrder) setCurrentOrder(order);

      if (typeof window !== "undefined") {
        setLastChatUrl(window.location.href);
      }
      setActiveOrderId(order.id);

      const paymentRes = await publicLocalMateRepository.createPaymentSession(order.id);
      const payment = paymentRes.payment;

      if (payment?.status === "PAID" || payment?.status === "NOT_REQUIRED") {
        openGuideChat(order.id);
      } else {
        setPaymentCheckoutUrl(payment?.checkoutUrl ?? null);
        openPayment(order.id);
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string } | null | undefined;
      setBookingError(errorObj?.message || publicCopy.orderInitError);
    } finally {
      setIsLoadingCandidate(false);
      setIsSubmittingOrder(false);
    }
  };

  const handleStartNewDiscovery = () => {
    resetSession();
    setCurrentOrder(null);
    setCandidateDetails(null);
    setConversationMessages([]);
  };

  const handleSendGuideMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = guideInput.trim();
    if (!body || !currentOrder?.id || isSendingGuideMessage) return;

    setIsSendingGuideMessage(true);
    setGuideInput("");

    const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: LocalChatMessage = {
      id: optimisticId,
      orderId: currentOrder.id,
      senderType: "GUEST",
      body,
      deliveryStatus: "SENDING",
      createdAt: new Date().toISOString(),
      clientMessageId,
      retryCount: 0,
    };
    setConversationMessages((prev) => [...prev, optimisticMessage]);

    try {
      const created = await publicLocalMateRepository.sendMessage(currentOrder.id, {
        body,
        clientMessageId,
      });

      setConversationMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...created, clientMessageId, deliveryStatus: created.deliveryStatus || "SENT" }
            : m,
        ),
      );
    } catch {
      setConversationMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, deliveryStatus: "FAILED" } : m,
        ),
      );
    } finally {
      setIsSendingGuideMessage(false);
    }
  };

  const handleRetryGuideMessage = async (msg: LocalChatMessage) => {
    if (!currentOrder?.id || isSendingGuideMessage) return;
    if ((msg.retryCount ?? 0) >= 3) return; // Bounded retry: max 3 attempts

    const clientMessageId = msg.clientMessageId || createClientMessageId();
    const newRetryCount = (msg.retryCount ?? 0) + 1;

    setConversationMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? { ...m, deliveryStatus: "SENDING", retryCount: newRetryCount, clientMessageId }
          : m,
      ),
    );
    setIsSendingGuideMessage(true);

    try {
      const created = await publicLocalMateRepository.sendMessage(currentOrder.id, {
        body: msg.body,
        clientMessageId,
      });

      setConversationMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...created, clientMessageId, retryCount: newRetryCount, deliveryStatus: created.deliveryStatus || "SENT" }
            : m,
        ),
      );
    } catch {
      setConversationMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, deliveryStatus: "FAILED", retryCount: newRetryCount } : m,
        ),
      );
    } finally {
      setIsSendingGuideMessage(false);
    }
  };

  const saveLocation = (targetLocation?: string) => {
    const value = (targetLocation ?? locationInput).trim();
    if (value.length < 2 || value.length > 120) {
      setLocationError(
        effectiveLocale === "en"
          ? "Please enter or select a destination between 2 and 120 characters."
          : effectiveLocale === "zh"
            ? "请输入或选择 2 到 120 个字符之间的目的地。"
            : effectiveLocale === "ko"
              ? "2자 이상 120자 이하의 목적지를 입력하거나 선택해 주세요."
              : effectiveLocale === "ru"
                ? "Пожалуйста, введите или выберите направление от 2 до 120 символов."
                : effectiveLocale === "hi"
                  ? "कृपया 2 से 120 अक्षरों के बीच का गंतव्य दर्ज करें या चुनें।"
                  : "Vui lòng nhập hoặc chọn địa điểm từ 2 đến 120 ký tự.",
      );
      return;
    }

    setLocation(value);
    setLocationInput(value);
    setLocationError("");
    void send(publicCopy.initialQuery, value, value);
  };

  const changeLocation = () => {
    setLocation("");
    setLocationInput("");
    setLocationError("");
    setInput("");
    setSuggestions([]);
    setActiveProposalKey(null);
    setActiveCandidateKey(null);
    setActiveOrderId(null);
    setActiveProposals([]);
    setCandidateDetails(null);
    setBookingPreviewFingerprint("");
    setCurrentOrder(null);
    setPaymentCheckoutUrl(null);
    setBookingError("");
    setCurrentStage("DISCOVERY");
    setMessages([
      {
        id: nextId.current++,
        sender: "localmate",
        text: publicCopy.askLocationFallback,
      },
    ]);
  };

  const openChat = (opener: "teaser" | "button") => {
    openerKindRef.current = opener;
    setIsOpen(true);
  };

  return (
    <div className="fixed bottom-4 right-3 z-50 sm:bottom-7 sm:right-7">
      {isOpen ? (
        <>
          <button
            type="button"
            onClick={closeChat}
            aria-label={publicCopy.closeChatAria}
            className="fixed inset-0 -z-10 bg-black/35 backdrop-blur-[2px] sm:hidden"
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={publicCopy.dialogAria}
            className="flex h-[min(640px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-[#d6c08b]/55 bg-[#fffdf8] shadow-[0_24px_70px_rgba(18,61,42,0.24)] sm:rounded-3xl"
          >
            {/* Header */}
            <header className="relative flex shrink-0 items-center justify-between bg-gradient-to-r from-[#123d2a] to-[#245942] px-4 py-3 text-white sm:px-5 sm:py-3.5">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                {viewMode !== "discovery" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBookingError("");
                      setViewMode("discovery");
                    }}
                    aria-label={publicCopy.backToDiscoveryAria}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95"
                  >
                    <VsIcon name="arrow_back" className="text-xl" />
                  </button>
                ) : (
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3c66b]/15 ring-1 ring-[#f3c66b]/65 sm:h-11 sm:w-11">
                    <VsIcon name="sparkles" className="text-xl text-[#f3c66b] sm:text-2xl" />
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75 motion-reduce:animate-none" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] ring-1 ring-[#123d2a]" />
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold leading-tight sm:text-base">
                    {viewMode === "discovery" && publicCopy.titleDiscovery}
                    {viewMode === "confirm" && publicCopy.titleConfirm}
                    {viewMode === "payment" && publicCopy.titlePayment}
                    {viewMode === "guide-chat" && (candidateDetails?.guide.fullName || currentOrder?.assignedGuide?.fullName || publicCopy.titleGuideDefault)}
                  </h2>
                  <p className="flex items-center gap-1.5 truncate text-[11.5px] text-white/80 sm:text-[12.5px]">
                    {viewMode === "discovery" && (
                      <>
                        <span className="font-medium text-[#a7f3d0]">{publicCopy.statusOnline}</span>
                        {location ? (
                          <>
                            <span className="text-white/40">•</span>
                            <span className="truncate">{location}</span>
                          </>
                        ) : null}
                      </>
                    )}
                    {viewMode === "confirm" && (
                      <span className="truncate text-[#f3c66b] font-medium">
                        {location || publicCopy.titleDiscovery}
                      </span>
                    )}
                    {viewMode === "payment" && currentOrder && (
                      <span className="truncate font-mono text-white/90">
                        #{currentOrder.orderNumber}
                      </span>
                    )}
                    {viewMode === "guide-chat" && currentOrder && (
                      <span className="truncate font-medium text-[#a7f3d0]">
                        {publicCopy.statusConnecting} • #{currentOrder.orderNumber}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {viewMode === "guide-chat" && (
                  <button
                    type="button"
                    onClick={handleStartNewDiscovery}
                    title={publicCopy.newDiscovery}
                    className="min-h-9 rounded-full px-2.5 text-xs font-semibold text-[#f3c66b] transition hover:bg-white/10 sm:min-h-10 sm:px-3 sm:text-xs"
                  >
                    {publicCopy.newDiscovery}
                  </button>
                )}
                {viewMode === "discovery" && location && (
                  <button
                    type="button"
                    disabled={chatMutation.isPending}
                    onClick={changeLocation}
                    className="min-h-9 rounded-full px-2.5 text-xs font-semibold text-[#f3c66b] transition hover:bg-white/10 disabled:opacity-50 sm:min-h-10 sm:px-3 sm:text-sm"
                  >
                    {publicCopy.changeLocation}
                  </button>
                )}
                {/* Language Switcher in Floating Chat Header */}
                <div className="relative" ref={langMenuRef}>
                  <button
                    type="button"
                    onClick={() => setLangMenuOpen((prev) => !prev)}
                    aria-label={chatUi.selectLanguageAria}
                    aria-expanded={langMenuOpen}
                    title={currentOption.nativeName}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-[#f3c66b]/80 bg-[#123d2a]/80 px-2.5 sm:px-3 text-xs font-bold text-white shadow-md backdrop-blur-sm transition-all hover:bg-[#123d2a] hover:border-[#ffe088] hover:ring-2 hover:ring-[#f3c66b]/30 active:scale-95 cursor-pointer"
                  >
                    <VsIcon name="globe" className="text-sm text-[#f3c66b] shrink-0" />
                    <span className="font-bold text-xs text-[#ffe6a0] tracking-wide">{currentOption.nativeName}</span>
                    <span className="text-[9px] text-[#ffe6a0]/80" aria-hidden="true">{langMenuOpen ? "▴" : "▾"}</span>
                  </button>

                  {langMenuOpen && (
                    <ul
                      role="listbox"
                      aria-label={chatUi.selectLanguageAria}
                      className="absolute right-0 top-full mt-2 z-50 w-48 overflow-hidden rounded-2xl border border-[#123d2a]/15 bg-white p-1.5 text-[#123d2a] shadow-2xl shadow-black/30 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
                    >
                      {LOCALE_OPTIONS.map((opt) => (
                        <li key={opt.code} role="option" aria-selected={opt.code === effectiveLocale}>
                          <button
                            type="button"
                            onClick={() => {
                              handleLocaleChange(opt.code);
                              setLangMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                              opt.code === effectiveLocale
                                ? "bg-[#123d2a] font-semibold text-white shadow-sm"
                                : "text-[#123d2a] hover:bg-[#f4ead0]/70"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <VsIcon name="globe" className="text-xs text-[#b8872f] shrink-0" />
                              <span className="font-semibold">{opt.nativeName}</span>
                            </span>
                            <span
                              className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                                opt.code === effectiveLocale
                                  ? "bg-[#b8872f]/25 text-[#f3c66b]"
                                  : "bg-black/5 text-[#627064]"
                              }`}
                            >
                              {opt.badge}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeChat}
                  aria-label={publicCopy.closeChatAria}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 sm:h-10 sm:w-10"
                >
                  <VsIcon name="close" className="text-xl" />
                </button>
              </div>
            </header>

            {/* VIEW 1: DISCOVERY AI CHAT */}
            {viewMode === "discovery" && (
              <>
                {currentOrder && (
                  <div className="shrink-0 flex items-center justify-between border-b border-emerald-600/30 bg-emerald-50 px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-1.5 truncate text-emerald-900 font-semibold">
                      <VsIcon name="chat" className="text-sm text-emerald-700 shrink-0" />
                      <span className="truncate">{publicCopy.activeOrderNoticePrefix} <b>#{currentOrder.orderNumber}</b></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewMode(currentOrder.payment?.status === "PAID" || currentOrder.status === "COMPLETED" ? "guide-chat" : "payment")}
                      className="shrink-0 rounded-lg bg-[#123d2a] px-2.5 py-1 text-[11px] font-bold text-[#f3c66b] hover:bg-[#184d35] transition ml-2"
                    >
                      {publicCopy.openOrderChat}
                    </button>
                  </div>
                )}
                {activeProposal && (
                  <div className="shrink-0 flex items-center justify-between border-b border-[#d6c08b]/40 bg-[#fff9ed] px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#123d2a] text-[#f3c66b]">
                        <VsIcon name="bookmark" className="text-xs" />
                      </span>
                      <span className="truncate text-[#123d2a] font-semibold">
                        {publicCopy.selectedProposalPrefix}: <b>{activeProposal.title}</b> ({activeProposal.duration})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleShowAlternatives(activeProposal.proposalKey)}
                      className="shrink-0 text-[11px] font-bold text-[#916e15] hover:underline ml-2"
                    >
                      {publicCopy.showAlternatives}
                    </button>
                  </div>
                )}
                <div
                  ref={messagesContainerRef}
                  className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#f8f4ea] to-[#f2ecdf]/60 p-3.5 sm:p-4"
                  aria-live="polite"
                >
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex w-full flex-col ${message.sender === "guest" ? "items-end" : "items-start"}`}
                    >
                      {(() => {
                        const isProposalRecommendation =
                          message.sender === "localmate" &&
                          Boolean(message.proposals && message.proposals.length > 0) &&
                          !Boolean(message.actions && message.actions.some((a) => a.type === "SELECT_GUIDE"));

                        if (isProposalRecommendation || !message.text?.trim()) {
                          return null;
                        }

                        return (
                          <div
                            className={`flex w-full items-start gap-2 ${
                              message.sender === "guest" ? "justify-end" : "justify-start"
                            }`}
                          >
                            {message.sender === "localmate" && (
                              <span
                                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10 ring-1 ring-[#123d2a]/15"
                                aria-hidden="true"
                              >
                                <VsIcon name="sparkles" className="text-sm text-[#2a6649]" />
                              </span>
                            )}
                            <div
                              className={`w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-sm sm:max-w-[80%] sm:py-3 sm:text-[14.5px] ${
                                message.sender === "guest"
                                  ? "rounded-tr-sm bg-gradient-to-br from-[#123d2a] to-[#1e5038] text-white"
                                  : "rounded-tl-sm border border-[#123d2a]/10 bg-white text-[#24342b]"
                              }`}
                            >
                              {renderMessageContent(message.text, message.sender === "guest")}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Proposal cards */}
                      {message.proposals && message.proposals.length > 0 && (
                        <div className="w-full max-w-full space-y-2.5 mt-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#123d2a]">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10 ring-1 ring-[#123d2a]/15"
                              aria-hidden="true"
                            >
                              <VsIcon name="sparkles" className="text-sm text-[#2a6649]" />
                            </span>
                            <span className="text-sm">
                              {effectiveLocale === "en"
                                ? "Suggested itineraries:"
                                : effectiveLocale === "zh"
                                  ? "推荐行程方案："
                                  : effectiveLocale === "ko"
                                    ? "추천 일정:"
                                    : effectiveLocale === "ru"
                                      ? "Рекомендуемые маршруты:"
                                      : effectiveLocale === "hi"
                                        ? "सुझाए गए यात्रा कार्यक्रम:"
                                        : "Phương án lịch trình gợi ý:"}
                            </span>
                          </div>
                          {message.proposals.map((proposal) => {
                            const isSelected = proposal.proposalKey === activeProposalKey;
                            return (
                              <div
                                key={proposal.proposalKey}
                                className={`flex flex-col gap-2 rounded-2xl p-3 shadow-sm transition ${
                                  isSelected
                                    ? "border-2 border-[#123d2a] bg-[#f2f8f4] ring-1 ring-[#123d2a]/20"
                                    : "border border-[#d6c08b]/50 bg-[#fffdf8] hover:border-[#b8872f]"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#916e15]">
                                        {proposal.location}
                                      </span>
                                      <span className="text-[11px] text-[#526458]">•</span>
                                      <span className="text-[11px] font-medium text-[#526458]">
                                        {proposal.duration}
                                      </span>
                                      {isSelected && (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#123d2a] px-2 py-0.5 text-[10px] font-bold text-[#f3c66b]">
                                          <VsIcon name="check" className="text-xs" />
                                          {publicCopy.selectedProposalPrefix}
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="mt-1 text-sm font-bold text-[#123d2a] leading-snug">
                                      {proposal.title}
                                    </h4>
                                  </div>
                                  {proposal.bookable && (
                                    <span className="shrink-0 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[11px] font-bold text-[#065f46] border border-[#10b981]/30">
                                      {effectiveLocale === "en"
                                        ? "Available"
                                        : effectiveLocale === "zh"
                                          ? "可预约"
                                          : effectiveLocale === "ko"
                                            ? "예약 가능"
                                            : effectiveLocale === "ru"
                                              ? "Доступно"
                                              : effectiveLocale === "hi"
                                                ? "उपलब्ध"
                                                : "Sẵn sàng phục vụ"}
                                    </span>
                                  )}
                                </div>

                                {proposal.highlights && proposal.highlights.length > 0 && (
                                  <div className="space-y-1 border-t border-[#d6c08b]/20 pt-2 text-xs text-[#3c5144]">
                                    {proposal.highlights.map((hl, i) => (
                                      <div key={i} className="flex items-start gap-1.5 leading-relaxed">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b8872f]" />
                                        <span>{hl}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 text-[11px] text-[#526458]">
                                  <VsIcon name="group" className="text-sm text-[#123d2a]" />
                                  <span>
                                    {proposal.availableGuideCount > 0
                                      ? effectiveLocale === "en"
                                        ? `${proposal.availableGuideCount} local guides available`
                                        : effectiveLocale === "zh"
                                          ? `${proposal.availableGuideCount} 位向导随时待命`
                                          : effectiveLocale === "ko"
                                            ? `${proposal.availableGuideCount}명의 가이드 대기 중`
                                            : effectiveLocale === "ru"
                                              ? `${proposal.availableGuideCount} гидов готовы к работе`
                                              : effectiveLocale === "hi"
                                                ? `${proposal.availableGuideCount} स्थानीय गाइड उपलब्ध`
                                                : `${proposal.availableGuideCount} hướng dẫn viên sẵn sàng phục vụ`
                                      : effectiveLocale === "en"
                                        ? "Guides updating..."
                                        : effectiveLocale === "zh"
                                          ? "向导信息更新中"
                                          : effectiveLocale === "ko"
                                            ? "가이드 정보 업데이트 중"
                                            : effectiveLocale === "ru"
                                              ? "Список гидов обновляется"
                                              : effectiveLocale === "hi"
                                                ? "गाइड की जानकारी अपडेट हो रही है"
                                                : "Hướng dẫn viên đang cập nhật"}
                                  </span>
                                </div>

                                {/* Action buttons: 2 streamlined actions (Primary: Select, Secondary: Alternatives) */}
                                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectProposal(proposal.proposalKey)}
                                    className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition active:scale-95 ${
                                      isSelected
                                        ? "bg-[#10b981] text-white shadow-sm"
                                        : "bg-[#123d2a] text-white hover:bg-[#184d35] shadow-sm"
                                    }`}
                                  >
                                    {isSelected && <VsIcon name="check" className="text-base text-white" />}
                                    <span>
                                      {isSelected
                                        ? effectiveLocale === "en"
                                          ? "Selected • Choose guide"
                                          : effectiveLocale === "zh"
                                            ? "已选 • 继续选择向导"
                                            : effectiveLocale === "ko"
                                              ? "선택됨 • 가이드 선택 계속"
                                              : effectiveLocale === "ru"
                                                ? "Выбрано • Выберите гида"
                                                : effectiveLocale === "hi"
                                                  ? "चुना गया • गाइड चुनें"
                                                  : "Đã chọn • Tiếp tục chọn HDV"
                                        : effectiveLocale === "en"
                                          ? "Select this itinerary"
                                          : effectiveLocale === "zh"
                                            ? "选择此行程"
                                            : effectiveLocale === "ko"
                                              ? "이 일정 선택"
                                              : effectiveLocale === "ru"
                                                ? "Выбрать этот маршрут"
                                                : effectiveLocale === "hi"
                                                  ? "यह यात्रा कार्यक्रम चुनें"
                                                  : "Chọn lịch trình này"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleShowAlternatives(proposal.proposalKey)}
                                    className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#123d2a]/20 bg-white px-3 py-2 text-xs font-semibold text-[#123d2a] transition hover:bg-[#f8f4ea] active:scale-95"
                                  >
                                    <VsIcon name="swap_horiz" className="text-base text-[#b8872f]" />
                                    <span>{publicCopy.showAlternatives}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Guide selection cards when actions are provided */}
                      {message.actions && message.actions.some((a) => a.type === "SELECT_GUIDE") && (
                        <div className="ml-0 sm:ml-9 mt-2.5 w-full max-w-[calc(100%-16px)] sm:max-w-[calc(100%-36px)] space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#123d2a]">
                            <VsIcon name="group" className="text-base text-[#b8872f]" />
                            <span>
                              {effectiveLocale === "en"
                                ? "Native local guides ready to accompany you:"
                                : effectiveLocale === "zh"
                                  ? "可同行的当地认证向导："
                                  : effectiveLocale === "ko"
                                    ? "동행 가능한 현지 로컬 가이드:"
                                    : effectiveLocale === "ru"
                                      ? "Местные гиды, готовые вас сопровождать:"
                                      : effectiveLocale === "hi"
                                        ? "उपलब्ध स्थानीय गाइड:"
                                        : "Hướng dẫn viên bản địa sẵn sàng đồng hành:"}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {message.actions
                              .filter((a) => a.type === "SELECT_GUIDE" && a.candidateKey)
                              .map((guideAction) => (
                                <div
                                  key={guideAction.candidateKey}
                                  className="flex flex-col justify-between rounded-2xl border border-[#d6c08b]/60 bg-gradient-to-br from-[#fffdf8] to-[#fff9ed] p-3.5 shadow-sm hover:border-[#123d2a] transition"
                                >
                                  <div className="flex items-center gap-2.5 mb-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10 text-[#123d2a]">
                                      <VsIcon name="person" className="text-lg text-[#123d2a]" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="font-bold text-[#123d2a] text-sm truncate">
                                        {guideAction.guideName || guideAction.label}
                                      </h5>
                                      <span className="text-[11px] font-medium text-[#627064]">
                                        {publicCopy.titleGuideDefault}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectGuide(
                                        guideAction.candidateKey!,
                                        guideAction.proposalKey || activeProposalKey || undefined,
                                      )
                                    }
                                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 focus-visible:outline-2 focus-visible:outline-[#b8872f]"
                                  >
                                    <span>
                                      {effectiveLocale === "en"
                                        ? "Select Guide & Book Tour"
                                        : effectiveLocale === "zh"
                                          ? "选择向导并预约"
                                          : effectiveLocale === "ko"
                                            ? "가이드 선택 및 예약"
                                            : effectiveLocale === "ru"
                                              ? "Выбрать гида и забронировать"
                                              : effectiveLocale === "hi"
                                                ? "गाइड चुनें और बुक करें"
                                                : "Chọn Hướng dẫn viên & Đặt tour"}
                                    </span>
                                    <VsIcon name="arrow_forward" className="text-sm text-[#f3c66b]" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Interactive Booking CTA inside chat message when tour is matched */}
                      {message.candidateKey && !message.actions?.some((a) => a.type === "SELECT_GUIDE") && (
                        <div className="ml-9 mt-2.5 w-fit max-w-[calc(100%-36px)] rounded-2xl border border-[#b8872f]/45 bg-[#fff9ed] p-3.5 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#123d2a]">
                            <VsIcon name="hotel_class" className="text-base text-[#b8872f]" />
                            <span>
                              {effectiveLocale === "en"
                                ? "Matching experience found!"
                                : effectiveLocale === "zh"
                                  ? "已找到匹配的体验！"
                                  : effectiveLocale === "ko"
                                    ? "맞춤 여행을 찾았습니다!"
                                    : effectiveLocale === "ru"
                                      ? "Подходящий маршрут найден!"
                                      : effectiveLocale === "hi"
                                        ? "उपयुक्त अनुभव मिल गया!"
                                        : "Trải nghiệm phù hợp được tìm thấy!"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#526458] leading-relaxed">
                            {activeProposalKey
                              ? effectiveLocale === "en"
                                ? "Selected itinerary has a guide ready. Click to preview details and book."
                                : effectiveLocale === "zh"
                                  ? "所选行程已有向导待命。点击预览并完成预约。"
                                  : effectiveLocale === "ko"
                                    ? "선택하신 일정에 가이드가 준비되어 있습니다. 클릭하여 확인 후 예약하세요."
                                    : effectiveLocale === "ru"
                                      ? "Для выбранного маршрута есть готовый гид. Нажмите для просмотра и бронирования."
                                      : effectiveLocale === "hi"
                                        ? "चुने गए कार्यक्रम के लिए गाइड तैयार है। विवरण देखने और बुक करने के लिए क्लिक करें।"
                                        : "Lịch trình đã chọn đã có hướng dẫn viên sẵn sàng. Nhấn để xem trước thông tin và đặt tour."
                              : effectiveLocale === "en"
                                ? "You can confirm booking and open direct chat with a native guide here."
                                : effectiveLocale === "zh"
                                  ? "您可以直接在此确认预约并开启与当地向导的直接对话。"
                                  : effectiveLocale === "ko"
                                    ? "여기에서 바로 예약을 확정하고 로컬 가이드와 직접 대화할 수 있습니다."
                                    : effectiveLocale === "ru"
                                      ? "Вы можете подтвердить бронирование и сразу начать диалог с местным гидом."
                                      : effectiveLocale === "hi"
                                        ? "आप यहाँ बुकिंग की पुष्टि कर सकते हैं और स्थानीय गाइड से सीधे बात कर सकते हैं।"
                                        : "Quý khách có thể xác nhận đặt tour và mở kênh trao đổi trực tiếp với Hướng dẫn viên bản địa."}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleSelectGuide(message.candidateKey!)}
                            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 focus-visible:outline-2 focus-visible:outline-[#b8872f]"
                          >
                            <span>
                              {effectiveLocale === "en"
                                ? "Select Guide & Book Tour"
                                : effectiveLocale === "zh"
                                  ? "选择向导并预约"
                                  : effectiveLocale === "ko"
                                    ? "가이드 선택 및 예약"
                                    : effectiveLocale === "ru"
                                      ? "Выбрать гида и забронировать"
                                      : effectiveLocale === "hi"
                                        ? "गाइड चुनें और बुक करें"
                                        : "Chọn Hướng dẫn viên & Đặt tour"}
                            </span>
                            <VsIcon name="arrow_forward" className="text-sm" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {!location && (
                    <div className="space-y-3 rounded-2xl border border-[#d6c08b]/45 bg-white/95 p-3.5 shadow-sm sm:p-4">
                      <div className="flex items-center justify-between border-b border-[#d6c08b]/20 pb-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#123d2a] sm:text-sm">
                          <VsIcon name="location_on" className="text-sm text-[#b8872f] sm:text-base" />
                          {publicCopy.popularDestinations}
                        </span>
                        <span className="text-xs font-medium text-[#627064]">
                          {effectiveLocale === "en"
                            ? "Tap to select quickly"
                            : effectiveLocale === "zh"
                              ? "点击快速选择"
                              : effectiveLocale === "ko"
                                ? "탭하여 빠른 선택"
                                : effectiveLocale === "ru"
                                  ? "Нажмите для выбора"
                                  : effectiveLocale === "hi"
                                    ? "त्वरित चयन के लिए टैप करें"
                                    : "Chạm để chọn nhanh"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                        {getLocalizedDestinations(effectiveLocale).map((dest) => (
                          <button
                            key={dest.provinceCode}
                            type="button"
                            onClick={() => saveLocation(dest.location)}
                            className="group relative flex min-h-[56px] flex-col justify-between rounded-xl border border-[#123d2a]/15 bg-[#fffdf8] p-2.5 text-left shadow-[0_1px_3px_rgba(18,61,42,0.04)] transition hover:border-[#b8872f] hover:bg-[#fff9ed] hover:shadow-sm active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#123d2a] sm:min-h-[60px] sm:p-3"
                          >
                            <div className="flex w-full items-center justify-between gap-1">
                              <span className="flex items-center gap-1.5 truncate text-[13px] font-bold text-[#123d2a] group-hover:text-[#916e15] sm:text-sm">
                                {dest.icon && <span className="text-sm leading-none shrink-0">{dest.icon}</span>}
                                <span className="truncate">{dest.label}</span>
                              </span>
                              <VsIcon
                                name="north_east"
                                className="text-xs text-[#b8872f] opacity-50 transition group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0"
                              />
                            </div>
                            <span className="mt-1 line-clamp-1 text-[11.5px] text-[#526458] group-hover:text-[#38483d] sm:text-xs">
                              {dest.tag}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMutation.isPending && (
                    <div className="flex items-center gap-2 text-xs text-[#2a6649]">
                      <span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10">
                        <VsIcon name="sparkles" className="animate-spin text-sm text-[#2a6649]" />
                      </span>
                      <div className="rounded-2xl rounded-tl-sm border border-[#123d2a]/10 bg-white px-4 py-2.5 shadow-sm">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {chatUi.typing}
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2a6649]" />
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                {!location ? (
                  <div className="shrink-0 border-t border-[#123d2a]/10 bg-white p-3 shadow-[0_-4px_16px_rgba(18,61,42,0.04)] sm:p-3.5">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveLocation();
                      }}
                    >
                      <label
                        htmlFor="localmate-public-location"
                        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#123d2a] sm:text-[13px]"
                      >
                        <VsIcon name="location_on" className="text-sm text-[#b8872f]" />
                        {publicCopy.locationSelectPrompt}
                      </label>
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          id="localmate-public-location"
                          value={locationInput}
                          onChange={(event) => {
                            setLocationInput(event.target.value);
                            if (locationError) setLocationError("");
                          }}
                          placeholder={publicCopy.searchLocationPlaceholder}
                          autoComplete="off"
                          aria-describedby={locationError ? "localmate-location-error" : undefined}
                          aria-label={publicCopy.locationSelectPrompt}
                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-base text-[#132119] outline-none transition placeholder:text-[#8a9890] focus:border-[#123d2a] focus:bg-white focus:ring-2 focus:ring-[#123d2a]/15 sm:text-sm"
                        />
                        <button
                          type="submit"
                          disabled={!locationInput.trim()}
                          aria-label={chatUi.sendAria}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4.5"
                        >
                          <span>{publicCopy.sendMessageBtn}</span>
                          <VsIcon name="send" className="text-base" />
                        </button>
                      </div>
                      {locationError && (
                        <p id="localmate-location-error" className="mt-1.5 text-xs font-medium text-red-700">
                          {locationError}
                        </p>
                      )}
                    </form>
                  </div>
                ) : (
                  <div className="shrink-0 border-t border-[#123d2a]/10 bg-white">
                    {suggestions.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto px-3.5 pt-3 sm:px-4">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion.query}
                            type="button"
                            disabled={chatMutation.isPending}
                            onClick={() => void send(suggestion.query)}
                            className="min-h-10 shrink-0 rounded-full border border-[#b8872f]/35 bg-[#fff7df] px-3.5 text-xs font-semibold text-[#735c00] transition hover:border-[#b8872f] hover:bg-[#fef0cb] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-11 sm:px-4 sm:text-sm"
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <form
                      className="flex gap-2 p-3 sm:p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                      }}
                    >
                      <input
                        ref={inputRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={chatInputPlaceholder}
                        aria-label={chatUi.sendAria}
                        disabled={chatMutation.isPending}
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-base text-[#132119] outline-none transition placeholder:text-[#8a9890] focus:border-[#123d2a] focus:bg-white focus:ring-2 focus:ring-[#123d2a]/15 disabled:opacity-60 sm:text-sm"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || chatMutation.isPending}
                        aria-label={chatUi.sendAria}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4.5"
                      >
                        <span className="hidden sm:inline">{publicCopy.sendMessageBtn}</span>
                        <VsIcon name="send" className="text-base" />
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}

            {/* VIEW 2: CONFIRMATION & ORDER FORM */}
            {viewMode === "confirm" && (
              <div className="flex flex-1 flex-col overflow-y-auto p-4 bg-[#fffdf8]">
                {isLoadingCandidate ? (
                  <div className="flex flex-1 items-center justify-center py-10">
                    <span className="text-xs font-semibold text-[#123d2a]">
                      {orderFormText.loadingTour}
                    </span>
                  </div>
                ) : (
                  <form onSubmit={handleConfirmOrder} className="space-y-4">
                    {/* Candidate Preview Card */}
                    <div className="rounded-2xl border border-[#d6c08b]/50 bg-[#fff9ed] p-3.5 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#916e15]">
                            {orderFormText.nativeExperience}
                          </span>
                          <h3 className="mt-0.5 text-sm font-bold text-[#123d2a]">
                            {isCandidatePreviewCurrent
                              ? candidateDetails?.service.name
                              : orderFormText.defaultServiceName}
                          </h3>
                        </div>
                        <span className="rounded-full bg-[#123d2a] px-2.5 py-1 text-xs font-bold text-[#f3c66b]">
                          {isCandidatePreviewCurrent && candidateDetails?.service.price
                            ? `${Number(candidateDetails.service.price).toLocaleString("vi-VN")} VND`
                            : orderFormText.listedPrice}
                        </span>
                      </div>
                      {isCandidatePreviewCurrent && candidateDetails?.guide && (
                        <div className="mt-3 flex items-center gap-2 border-t border-[#d6c08b]/30 pt-2.5 text-xs text-[#24342b]">
                          <VsIcon name="person" className="text-base text-[#123d2a]" />
                          <span className="font-semibold">{candidateDetails.guide.fullName}</span>
                          <span className="text-[#916e15] font-bold">★ {candidateDetails.guide.rating}</span>
                        </div>
                      )}
                    </div>

                    {/* Booking Form Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-[#123d2a] mb-1">
                          {orderFormText.fullNameLabel} <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          disabled={Boolean(currentOrder)}
                          value={guestDisplayName}
                          onChange={(e) => setGuestDisplayName(e.target.value)}
                          placeholder={orderFormText.fullNamePlaceholder}
                          className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold text-[#123d2a] mb-1">
                            {orderFormText.partySizeLabel} <span className="text-red-600">*</span>
                          </label>
                          <select
                            value={partySize}
                            disabled={Boolean(currentOrder)}
                            onChange={(e) => setPartySize(Number(e.target.value))}
                            className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                          >
                            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                              <option key={n} value={n}>
                                {orderFormText.guestCount(n)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#123d2a] mb-1">
                            {orderFormText.phoneLabel} <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="tel"
                            required
                            disabled={Boolean(currentOrder)}
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            placeholder={orderFormText.phonePlaceholder}
                            className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                          />
                        </div>
                      </div>

                      {/* Gợi ý tinh tế */}
                      <div className="flex items-start gap-2 rounded-xl bg-emerald-50/80 p-2.5 text-xs text-emerald-900 border border-emerald-200/60">
                        <VsIcon name="chat" className="text-sm shrink-0 mt-0.5 text-emerald-700" />
                        <span>{orderFormText.chatTip}</span>
                      </div>
                    </div>

                    {/* Selected Proposal Info */}
                    {activeProposal && (
                      <div className="flex items-center gap-2.5 rounded-2xl border border-[#123d2a]/15 bg-[#f4f9f6] p-3 text-xs text-[#123d2a]">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a] text-[#f3c66b]">
                          <VsIcon name="bookmark" className="text-sm" />
                        </span>
                        <div className="min-w-0">
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#916e15]">
                            {publicCopy.selectedProposalPrefix}
                          </span>
                          <h4 className="truncate font-bold text-[#123d2a] text-[13px]">
                            {activeProposal.title}
                          </h4>
                          <span className="text-[11px] text-[#526458]">
                            {activeProposal.location} • {activeProposal.duration}
                          </span>
                        </div>
                      </div>
                    )}

                    {bookingError && (
                      <p className="text-xs font-semibold text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200">
                        {bookingError}
                      </p>
                    )}

                    {(!activeProposalKey || !activeCandidateKey) && (
                      <p className="text-xs font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                        {publicCopy.selectGuideFirstError}
                      </p>
                    )}

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={
                          isSubmittingOrder ||
                          !canProceedToBooking({
                            proposalKey: activeProposalKey,
                            candidateKey: activeCandidateKey,
                          })
                        }
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSubmittingOrder ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>{orderFormText.creatingOrder}</span>
                          </>
                        ) : (
                          <>
                            <span>
                              {currentOrder
                                ? orderFormText.retryPayment
                                : isCandidatePreviewCurrent
                                  ? orderFormText.confirmAndPay
                                  : orderFormText.reviewInfo}
                            </span>
                            <VsIcon name="check_circle" className="text-lg text-[#f3c66b]" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* VIEW 3: PAYMENT VIA STRIPE QR / LINK */}
            {viewMode === "payment" && currentOrder && (
              <div className="flex flex-1 flex-col items-center justify-between p-4 overflow-y-auto bg-[#fffdf8] text-center">
                <div className="w-full space-y-3">
                  <div className="rounded-2xl border border-[#d6c08b]/50 bg-[#fff9ed] p-3 text-left">
                    <div className="flex items-center justify-between text-xs text-[#526458]">
                      <span className="font-mono font-medium text-[#526458]">#{currentOrder.orderNumber}</span>
                      <span className="font-semibold text-[#123d2a]">{paymentViewText.guestsCount(currentOrder.quantity)}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-[#123d2a]">
                      {currentOrder.serviceNameSnapshot}
                    </h3>
                    <div className="mt-3 space-y-1.5 border-t border-[#d6c08b]/30 pt-2.5 text-xs text-[#526458]">
                      <div className="flex items-center justify-between">
                        <span>{paymentViewText.totalCost}</span>
                        <span className="font-semibold text-[#123d2a]">
                          {Number(
                            currentOrder.payment?.tourTotalAmount ??
                              currentOrder.customerTotalAmount ??
                              currentOrder.totalAmount,
                          ).toLocaleString("vi-VN")}{" "}
                          VND
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-bold text-emerald-800">
                        <span>{paymentViewText.depositFee}</span>
                        <span className="text-sm">
                          {Number(
                            currentOrder.payment?.platformFeeAmount ??
                              currentOrder.hotelServiceFeeAmount ??
                              0,
                          ).toLocaleString("vi-VN")}{" "}
                          VND
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#806118]">
                        <span>{paymentViewText.remainingFee}</span>
                        <span className="font-semibold">
                          {Number(
                            currentOrder.payment?.guideRemainingAmount ??
                              currentOrder.partnerSubtotal ??
                              0,
                          ).toLocaleString("vi-VN")}{" "}
                          VND
                        </span>
                      </div>
                    </div>
                  </div>

                  {paymentCheckoutUrl ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#123d2a]/10 bg-white p-4 shadow-sm">
                      <div className="p-2 bg-white rounded-xl shadow-inner border border-black/5">
                        <QRCodeSVG value={paymentCheckoutUrl} size={170} level="M" />
                      </div>
                      <p className="mt-2.5 text-xs font-semibold text-[#123d2a]">
                        {paymentViewText.qrInstruction}
                      </p>
                      <a
                        href={paymentCheckoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#123d2a] bg-[#f8f4ea] px-4 text-xs font-bold text-[#123d2a] transition hover:bg-[#123d2a] hover:text-white"
                      >
                        <span>{paymentViewText.openStripeLink}</span>
                        <VsIcon name="open_in_new" className="text-sm" />
                      </a>
                    </div>
                  ) : (
                    <div className="py-8">
                      <span className="text-xs text-[#526458]">{paymentViewText.initializingGateway}</span>
                    </div>
                  )}

                  {isPollingPayment && (
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-[#2a6649]">
                      <span className="h-2 w-2 animate-ping rounded-full bg-[#10b981]" />
                      <span>{paymentViewText.pollingPayment}</span>
                    </div>
                  )}
                </div>

                <div className="w-full pt-3">
                  <button
                    type="button"
                    onClick={() => setViewMode("discovery")}
                    className="text-xs font-semibold text-[#526458] hover:text-[#123d2a] underline"
                  >
                    {paymentViewText.backToDiscovery}
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 4: DIRECT PAID GUIDE CHAT */}
            {viewMode === "guide-chat" && (
              <div className="flex flex-1 flex-col overflow-hidden bg-[#fffdf8]">
                <div className="flex-1 space-y-3 overflow-y-auto p-3.5 bg-gradient-to-b from-[#f8f4ea] to-[#f2ecdf]/50">
                  {currentOrder?.status === "COMPLETED" ? (
                    <div className="rounded-xl border border-[#10b981]/40 bg-[#ecfdf5] p-3 text-center text-xs font-bold text-[#065f46] shadow-sm space-y-2">
                      <p>{guideChatViewText.completedBanner}</p>
                      <button
                        type="button"
                        onClick={handleStartNewDiscovery}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#123d2a] px-3.5 py-1.5 text-xs font-bold text-[#f3c66b] hover:bg-[#184d35] transition shadow-sm"
                      >
                        <VsIcon name="sparkles" className="text-sm" />
                        <span>{publicCopy.newDiscovery}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#10b981]/30 bg-[#ecfdf5] p-2.5 text-center text-xs font-semibold text-[#065f46]">
                      {guideChatViewText.connectedBanner}
                    </div>
                  )}

                  {conversationMessages.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#526458]">
                      {guideChatViewText.emptyMessages}
                    </div>
                  ) : (
                    conversationMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex w-full items-start gap-2 ${
                          msg.senderType === "GUEST" ? "justify-end" : "justify-start"
                        }`}
                      >
                        {msg.senderType !== "GUEST" && (
                          <span
                            title={publicCopy.titleGuideDefault}
                            aria-label={publicCopy.titleGuideDefault}
                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a] text-[#f3c66b] ring-1 ring-[#123d2a]/30 shadow-2xs"
                          >
                            <VsIcon name="person" className="text-sm" />
                          </span>
                        )}
                        <div className="flex flex-col items-end max-w-[85%]">
                          <div
                            className={`w-fit rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm sm:text-sm ${
                              msg.senderType === "GUEST"
                                ? "rounded-tr-sm bg-[#123d2a] text-white"
                                : "rounded-tl-sm border border-[#123d2a]/10 bg-white text-[#24342b]"
                            }`}
                          >
                            {msg.body}
                          </div>
                          {msg.senderType === "GUEST" && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#526458]">
                              {(msg.deliveryStatus === "SENDING" || msg.deliveryStatus === "PENDING") && (
                                <span className="flex items-center gap-1 text-[#718277]">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#718277]" />
                                  <span>{publicCopy.sendingText}</span>
                                </span>
                              )}
                              {msg.deliveryStatus === "FAILED" && (
                                <span className="flex items-center gap-1.5 text-red-600">
                                  <span>{publicCopy.sendFailedText}</span>
                                  {(msg.retryCount ?? 0) < 3 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRetryGuideMessage(msg)}
                                      className="font-bold underline hover:text-red-700"
                                    >
                                      {publicCopy.retryText}
                                    </button>
                                  )}
                                </span>
                              )}
                              {(msg.deliveryStatus === "SENT" || msg.deliveryStatus === "DELIVERED") && (
                                <span className="text-[#88988e]">{publicCopy.sentText}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={guideChatEndRef} />
                </div>

                {/* Guide Message Input Bar */}
                {currentOrder?.status === "COMPLETED" ? (
                  <div className="border-t border-[#123d2a]/10 bg-white p-3 text-center text-xs font-medium text-[#526458]">
                    {publicCopy.orderCompletedText}
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendGuideMessage}
                    className="flex gap-2 border-t border-[#123d2a]/10 bg-white p-3"
                  >
                    <input
                      type="text"
                      value={guideInput}
                      onChange={(e) => setGuideInput(e.target.value)}
                      placeholder={publicCopy.guideMessagePlaceholder}
                      disabled={isSendingGuideMessage}
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!guideInput.trim() || isSendingGuideMessage}
                      aria-label={publicCopy.sendMessageAria}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:opacity-40"
                    >
                      <span>{publicCopy.sendMessageBtn}</span>
                      <VsIcon name="send" className="text-base" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="flex flex-col items-end gap-3">
          {/* Speech-bubble teaser card */}
          <aside
            ref={teaserRef}
            aria-label={chatUi.teaserTitle}
            className="relative w-[196px] cursor-pointer rounded-2xl border border-[#d6c08b]/60 bg-[#fffdf8] px-4 py-3 shadow-[0_8px_24px_rgba(18,61,42,0.13)] transition-all hover:border-[#d6c08b] hover:shadow-[0_10px_28px_rgba(18,61,42,0.18)]"
            onClick={() => openChat("teaser")}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openChat("teaser");
              }
            }}
          >
            <div className="absolute -bottom-[9px] right-6 h-[18px] w-[18px] rotate-45 border-b border-r border-[#d6c08b]/60 bg-[#fffdf8]" />
            <div className="mb-1.5 flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10b981]" />
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#916e15]">{chatUi.teaserTag}</span>
            </div>
            <p className="text-[13px] font-semibold leading-snug text-[#1b352e]">
              {chatUi.teaserTitle}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#6b7d73]">
              {chatUi.teaserDesc}
            </p>
          </aside>

          {/* Glowing round avatar FAB */}
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => openChat("button")}
            aria-label={publicCopy.openFabAria}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#123d2a] via-[#1a5038] to-[#2a6649] shadow-[0_8px_28px_rgba(18,61,42,0.38)] ring-2 ring-[#f3c66b]/80 transition-all duration-300 hover:scale-110 hover:shadow-[0_12px_36px_rgba(18,61,42,0.50)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] motion-reduce:transform-none cursor-pointer"
          >
            <span className="absolute inset-[-4px] animate-ping rounded-full bg-[#f3c66b]/20 motion-reduce:animate-none" />
            <VsIcon name="sparkles" className="relative text-[26px] text-[#f3c66b]" />
          </button>
        </div>
      )}
    </div>
  );
}
