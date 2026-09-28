"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import type { GuestLocale } from "@/features/guest-os/i18n/config";
import { GUEST_AI_FLOATING_CHAT, hasHotelFeature } from "@/features/hotel-features/hotel-features";
import type { GuestChatAction } from "@/features/marketplace/types/marketplace-contract";
import { LocalMateBookingCard } from "./localmate-booking-card";
import { LocalMateOrderRequestDialog } from "@/features/marketplace/components/localmate-order-request-dialog";
import { LocalMateOrderChat } from "@/features/marketplace/components/localmate-order-chat";

type ChatMessage = {
  id: string;
  sender: "guest" | "concierge";
  text: string;
  time: string;
  action?: GuestChatAction | null;
};

type QuickSuggestion = {
  id: string;
  label: string;
  query: string;
  icon?: string;
};

const SUGGESTIONS_BY_LOCALE: Record<string, QuickSuggestion[]> = {
  vi: [
    {
      id: "nearby",
      label: "📍 Gần khách sạn",
      query: "Gợi ý trải nghiệm khám phá gần khách sạn",
    },
    {
      id: "day_tour",
      label: "🗓️ Tour trong ngày",
      query: "Gợi ý tour trong ngày gần khách sạn",
    },
    {
      id: "guide",
      label: "🧭 Hướng dẫn viên bản địa",
      query: "Gợi ý hướng dẫn viên bản địa LocalMate trong khu vực",
    },
    {
      id: "food",
      label: "🍲 Ẩm thực bản địa",
      query: "Gợi ý các món ngon và quán ăn bản địa đặc sắc gần đây",
    },
    {
      id: "spots",
      label: "📸 Điểm check-in đẹp",
      query: "Những địa điểm ngắm cảnh và chụp ảnh đẹp nhất quanh đây",
    },
    {
      id: "culture",
      label: "🎒 Trải nghiệm văn hóa",
      query: "Gợi ý các hoạt động trải nghiệm văn hóa truyền thống bản địa",
    },
    {
      id: "booking",
      label: "🤝 Đặt hướng dẫn viên",
      query: "Tôi muốn tìm và đặt hướng dẫn viên LocalMate đồng hành",
    },
  ],
  en: [
    {
      id: "nearby",
      label: "📍 Near hotel",
      query: "Recommend experiences and discoveries near my hotel",
    },
    {
      id: "day_tour",
      label: "🗓️ Day tours",
      query: "Recommend day tours near my hotel",
    },
    {
      id: "guide",
      label: "🧭 Native Local Guides",
      query: "Are there any verified English-speaking LocalMate native guides available?",
    },
    {
      id: "food",
      label: "🍲 Local Cuisine",
      query: "Recommend authentic local specialties and dining spots nearby",
    },
    {
      id: "spots",
      label: "📸 Scenic Photo Spots",
      query: "What are the best viewpoints and photography spots in the area?",
    },
    {
      id: "culture",
      label: "🎒 Cultural Activities",
      query: "What authentic indigenous cultural activities can I experience here?",
    },
    {
      id: "booking",
      label: "🤝 Book a Guide",
      query: "I would like to find and book a certified LocalMate guide",
    },
  ],
  zh: [
    {
      id: "nearby",
      label: "📍 酒店附近",
      query: "推荐酒店所在区域的特色探索体验",
    },
    {
      id: "day_tour",
      label: "🗓️ 一日游",
      query: "推荐酒店附近的一日游精选线路",
    },
    {
      id: "guide",
      label: "🧭 当地认证向导",
      query: "我想了解本地区的 LocalMate 认证当地向导",
    },
    {
      id: "food",
      label: "🍲 地道美食",
      query: "附近有哪些值得品尝的地道风味与特色美食？",
    },
    {
      id: "spots",
      label: "📸 绝美打卡机位",
      query: "推荐附近最出片的自然风光与拍照机位",
    },
    {
      id: "culture",
      label: "🎒 民俗文化体验",
      query: "这里有哪些独具特色的少数民族民俗文化体验？",
    },
    {
      id: "booking",
      label: "🤝 预约向导",
      query: "我想预约一位 LocalMate 本地向导陪同旅行",
    },
  ],
  ko: [
    {
      id: "nearby",
      label: "📍 호텔 주변",
      query: "호텔 주변의 로컬 체험 및 명소를 추천해 주세요",
    },
    {
      id: "day_tour",
      label: "🗓️ 당일 투어",
      query: "호텔 인근의 알찬 당일 투어를 추천해 주세요",
    },
    {
      id: "guide",
      label: "🧭 현지 로컬 가이드",
      query: "현지 로컬 가이드(LocalMate) 추천을 받고 싶습니다",
    },
    {
      id: "food",
      label: "🍲 로컬 미식",
      query: "주변의 맛있는 현지 전통 음식과 추천 맛집을 알려주세요",
    },
    {
      id: "spots",
      label: "📸 포토 스팟",
      query: "인근에서 가장 멋진 풍경을 담을 수 있는 사진 명소는 어디인가요?",
    },
    {
      id: "culture",
      label: "🎒 문화 체험",
      query: "이 지역에서 즐길 수 있는 전통 문화 체험을 알려주세요",
    },
    {
      id: "booking",
      label: "🤝 가이드 예약",
      query: "LocalMate 현지 가이드 예약을 진행하고 싶습니다",
    },
  ],
  ru: [
    {
      id: "nearby",
      label: "📍 Рядом с отелем",
      query: "Порекомендуйте интересные места и активности рядом с отелем",
    },
    {
      id: "day_tour",
      label: "🗓️ Однодневные туры",
      query: "Порекомендуйте однодневные туры в регионе отеля",
    },
    {
      id: "guide",
      label: "🧭 Местные гиды",
      query: "Порекомендуйте проверенных местных гидов LocalMate",
    },
    {
      id: "food",
      label: "🍲 Местная кухня",
      query: "Какие традиционные блюда и аутентичные заведения стоит посетить?",
    },
    {
      id: "spots",
      label: "📸 Красивые виды",
      query: "Где находятся лучшие панорамные точки и локации для фото?",
    },
    {
      id: "culture",
      label: "🎒 Культурный опыт",
      query: "Какие традиционные культурные активности доступны в этом регионе?",
    },
    {
      id: "booking",
      label: "🤝 Забронировать гида",
      query: "Я хочу забронировать местного гида LocalMate для сопровождения",
    },
  ],
  hi: [
    {
      id: "nearby",
      label: "📍 होटल के पास",
      query: "होटल के पास के अनोखे अनुभव और पर्यटन स्थल सुझाएं",
    },
    {
      id: "day_tour",
      label: "🗓️ एक-दिवसीय यात्रा",
      query: "होटल के क्षेत्र में बेहतरीन एक-दिवसीय यात्रा सुझाएं",
    },
    {
      id: "guide",
      label: "🧭 स्थानीय गाइड",
      query: "क्या यहाँ प्रमाणित LocalMate स्थानीय गाइड उपलब्ध हैं?",
    },
    {
      id: "food",
      label: "🍲 स्थानीय भोजन",
      query: "यहाँ के प्रसिद्ध पारंपरिक व्यंजन और भोजन स्थल सुझाएं",
    },
    {
      id: "spots",
      label: "📸 दर्शनीय स्थल",
      query: "आस-पास के सबसे सुंदर दृश्य और फोटो स्थल कौन से हैं?",
    },
    {
      id: "culture",
      label: "🎒 सांस्कृतिक अनुभव",
      query: "यहाँ कौन-से पारंपरिक और सांस्कृतिक अनुभव उपलब्ध हैं?",
    },
    {
      id: "booking",
      label: "🤝 गाइड बुक करें",
      query: "मैं एक प्रमाणित LocalMate गाइड बुक करना चाहता हूँ",
    },
  ],
};

function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getWelcomeMessage(locale: GuestLocale, guestName?: string): string {
  const name = guestName ? ` ${guestName}` : "";

  switch (locale) {
    case "en":
      return `Hello${name}! I'm **LocalMate AI**. 🌿\n\nI'm ready 24/7 to assist you with local travel itineraries, authentic regional experiences, and native guide connections. How can I inspire your journey today?`;
    case "zh":
      return `您好${name}！我是 **LocalMate AI** 原生旅游助理。🌿\n\n我全天候 24/7 为您提供当地特色体验线路、风土人情及认证向导预约推荐。今天有什么旅行计划需要我协助的吗？`;
    case "ko":
      return `안녕하세요${name}님! **LocalMate AI** 현지 여행 비서입니다. 🌿\n\n현지 여행 일정, 맞춤 문화 체험 및 로컬 가이드 연결을 24시간 지원해 드립니다. 오늘 어떤 여행 정보를 찾아드릴까요?`;
    case "ru":
      return `Здравствуйте${name}! Я **LocalMate AI** — ваш персональный гид по местным путешествиям. 🌿\n\nЯ готов круглосуточно помочь вам с уникальными маршрутами, аутентичными впечатлениями и подбором местных гидов LocalMate. Куда бы вы хотели отправиться сегодня?`;
    case "hi":
      return `नमस्ते${name}! मैं **LocalMate AI** — आपका स्थानीय यात्रा सहायक हूँ। 🌿\n\nस्थानीय पर्यटन स्थलों, सांस्कृतिक अनुभवों और LocalMate गाइड से जुड़ने के लिए मैं 24/7 उपलब्ध हूँ। आज आपकी यात्रा में क्या मदद करूँ?`;
    default:
      return `Dạ xin chào${name}! Em là **LocalMate AI** — Trợ lý du lịch bản địa của Quý khách. 🌿\n\nEm luôn sẵn sàng hỗ trợ Quý khách 24/7 về các tour khám phá, trải nghiệm văn hóa ẩm thực đặc sắc và kết nối hướng dẫn viên bản địa LocalMate. Quý khách muốn khám phá điều gì hôm nay ạ?`;
  }
}

function getChatUiText(locale: GuestLocale) {
  switch (locale) {
    case "en":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "Need local travel tips & guides?",
        teaserDesc: "I can suggest authentic local tours, cultural spots, and connect you with native LocalMate guides!",
        readyText: "Online",
        bannerText: "Native Travel & LocalMate Guide Assistant",
        typing: "LocalMate is composing an answer...",
        suggestionsTitle: "Quick suggestions:",
        suggestionsScroll: "Swipe horizontally",
        placeholder: "Ask about tours, guides, local food, culture...",
        sendAria: "Send message",
        closeAria: "Minimize chat",
      };
    case "zh":
      return {
        teaserTag: "✨ LocalMate 助理",
        teaserTitle: "需要旅行建议或当地向导推荐吗？",
        teaserDesc: "我可以为您推荐特色原生态路线、地道美食，或对接认证 LocalMate 当地向导！",
        readyText: "在线",
        bannerText: "原生旅游助理 & LocalMate 向导咨询",
        typing: "LocalMate 正在撰写回复...",
        suggestionsTitle: "为您推荐的快速提问：",
        suggestionsScroll: "左右滑动查看更多",
        placeholder: "咨询特色线路、LocalMate 向导、风土人情...",
        sendAria: "发送消息",
        closeAria: "收起聊天窗口",
      };
    case "ko":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "현지 여행 추천이나 가이드가 필요하신가요?",
        teaserDesc: "맞춤 로컬 투어 추천, 고유 문화 체험 및 인증된 LocalMate 가이드 연결을 도와드립니다!",
        readyText: "온라인",
        bannerText: "현지 여행 비서 & LocalMate 가이드 연결",
        typing: "LocalMate가 답변 작성 중...",
        suggestionsTitle: "빠른 질문 선택:",
        suggestionsScroll: "가로로 스크롤하여 더 보기",
        placeholder: "투어 일정, LocalMate 가이드, 지역 명소 문의...",
        sendAria: "메시지 전송",
        closeAria: "채팅 닫기",
      };
    case "ru":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "Нужен совет по турам или местный гид?",
        teaserDesc: "Помогу подобрать аутентичный маршрут, познакомиться с местной культурой и найти гида LocalMate!",
        readyText: "В сети",
        bannerText: "Гид по местным путешествиям & LocalMate",
        typing: "LocalMate печатает ответ...",
        suggestionsTitle: "Быстрые подсказки:",
        suggestionsScroll: "Прокрутите для просмотра",
        placeholder: "Спросите о турах, гидах LocalMate, традициях...",
        sendAria: "Отправить сообщение",
        closeAria: "Закрыть чат",
      };
    case "hi":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "स्थानीय यात्रा या गाइड की सलाह चाहिए?",
        teaserDesc: "मैं आपको प्रामाणिक स्थानीय यात्राएं, सांस्कृतिक अनुभव और LocalMate गाइड सुझा सकता हूँ!",
        readyText: "ऑनलाइन",
        bannerText: "स्थानीय यात्रा सहायक और LocalMate गाइड",
        typing: "LocalMate उत्तर लिख रहा है...",
        suggestionsTitle: "त्वरित सुझाव:",
        suggestionsScroll: "अधिक देखने के लिए स्वाइप करें",
        placeholder: "टूर, LocalMate गाइड या स्थानीय संस्कृति के बारे में पूछें...",
        sendAria: "संदेश भेजें",
        closeAria: "चैट बंद करें",
      };
    default:
      return {
        teaserTag: "✨ Trợ lý LocalMate",
        teaserTitle: "Cần gợi ý du lịch & hướng dẫn viên?",
        teaserDesc: "Em có thể gợi ý các tour trải nghiệm bản địa độc đáo, ẩm thực và kết nối hướng dẫn viên LocalMate cho Quý khách!",
        readyText: "Trực tuyến",
        bannerText: "Trợ lý du lịch bản địa & Hướng dẫn viên LocalMate",
        typing: "LocalMate đang soạn câu trả lời...",
        suggestionsTitle: "Gợi ý nhanh cho Quý khách:",
        suggestionsScroll: "Vuốt ngang xem thêm",
        placeholder: "Hỏi về tour trải nghiệm, hướng dẫn viên LocalMate, văn hóa ẩm thực...",
        sendAria: "Gửi tin nhắn",
        closeAria: "Thu nhỏ hộp chat",
      };
  }
}

function getNetworkErrorReply(locale: GuestLocale): string {
  switch (locale) {
    case "en":
      return "LocalMate AI is currently unavailable or connecting to the network. Please contact the front desk directly for immediate assistance! ✨";
    case "zh":
      return "网络服务暂时连接中，如需紧急帮助，请直接向前台咨询！✨";
    case "ko":
      return "현재 네트워크 연결 중입니다. 긴급한 문의는 프런트 데스크로 직접 문의해 주세요! ✨";
    case "ru":
      return "Связь временно недоступна. Пожалуйста, обратитесь на стойку регистрации для получения помощи! ✨";
    case "hi":
      return "नेटवर्क सेवा वर्तमान में अनुपलब्ध है। कृपया सहायता के लिए सीधे फ्रंट डेस्क से संपर्क करें! ✨";
    default:
      return "Dạ kết nối tới trợ lý LocalMate đang được tối ưu trong giây lát. Quý khách vui lòng thử lại sau hoặc liên hệ trực tiếp quầy lễ tân để được hỗ trợ ngay nhé! ✨";
  }
}

function renderFormattedMessage(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ");
    const content = isBullet ? trimmed.slice(2) : line;

    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

    return (
      <span
        key={lineIdx}
        className={`block min-h-[1.3em] ${
          isBullet ? "flex items-start gap-1.5 pl-1 my-0.5" : ""
        }`}
      >
        {isBullet && (
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b18b26]" />
        )}
        <span className="flex-1">
          {parts.map((part, partIdx) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={partIdx} className="font-semibold text-inherit">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith("`") && part.endsWith("`")) {
              return (
                <code
                  key={partIdx}
                  className="mx-0.5 inline-block rounded-md border border-[#b18b26]/30 bg-[#b18b26]/12 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#6d5118]"
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            return part;
          })}
        </span>
      </span>
    );
  });
}

function isGuestWorkspaceRoute(pathname: string | null): boolean {
  if (
    !pathname ||
    pathname.startsWith("/g/language") ||
    pathname === "/g/messages" ||
    pathname === "/g"
  ) {
    return false;
  }
  return (
    pathname.startsWith("/g/services") ||
    pathname.startsWith("/g/home") ||
    pathname.startsWith("/g/requests") ||
    pathname.startsWith("/g/nearby") ||
    pathname.startsWith("/g/marketplace")
  );
}

export function GuestFloatingChat() {
  const pathname = usePathname();
  const hydrated = useGuestStoreHydrated();
  const room = useGuestStore((state) => state.room);
  const guest = useGuestStore((state) => state.guest);
  const hotel = useGuestStore((state) => state.hotel);
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const language = useGuestStore((state) => state.language);

  // Lấy ngôn ngữ Web mà khách đã chọn
  const { locale } = useGuestI18n();

  const isWorkspace = isGuestWorkspaceRoute(pathname);
  const hasSelectedLanguage = Boolean(language);

  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [showTeaser, setShowTeaser] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Dynamic suggestions from agent — null = show static chips, [] = hide tray, [...] = show agent chips
  const [dynamicSuggestions, setDynamicSuggestions] = useState<QuickSuggestion[] | null>(null);

  const uiText = useMemo(() => getChatUiText(locale), [locale]);
  const suggestions = useMemo(
    () => SUGGESTIONS_BY_LOCALE[locale] || SUGGESTIONS_BY_LOCALE.en || SUGGESTIONS_BY_LOCALE.vi,
    [locale]
  );

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedBookingAction, setSelectedBookingAction] = useState<GuestChatAction | null>(null);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);

  const welcomeMessage: ChatMessage = useMemo(
    () => ({
      id: "welcome-init",
      sender: "concierge",
      text: getWelcomeMessage(locale, guest?.displayName),
      time: getCurrentTimeString(),
    }),
    [locale, guest?.displayName]
  );

  const messages: ChatMessage[] = useMemo(() => {
    return [welcomeMessage, ...chatHistory];
  }, [welcomeMessage, chatHistory]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageIdRef = useRef(100);

  // Auto-scroll to bottom when messages update or typing state changes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isOpen]);

  const dismissTeaser = useCallback(() => {
    setShowTeaser(false);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("vietsage_guest_teaser_seen", "true");
      }
    } catch {}
  }, []);

  // Floating teaser message appears once after entering guest workspace / selecting language
  useEffect(() => {
    if (!hasSelectedLanguage || !isWorkspace) return;

    try {
      if (typeof window !== "undefined" && sessionStorage.getItem("vietsage_guest_teaser_seen") === "true") {
        return;
      }
    } catch {}

    // Delay entrance slightly so guest sees the workspace before being greeted
    const showTimer = setTimeout(() => {
      setShowTeaser(true);
    }, 1200);

    // Auto-dismiss teaser after 7 seconds so it doesn't block workspace actions
    const hideTimer = setTimeout(() => {
      setShowTeaser(false);
      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("vietsage_guest_teaser_seen", "true");
        }
      } catch {}
    }, 7200);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [hasSelectedLanguage, isWorkspace]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setHasUnread(false);
        dismissTeaser();
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, dismissTeaser]);

  const destinationSubtitle = hotel?.name
    ? (room?.roomNumber ? `${hotel.name} • P.${room.roomNumber}` : hotel.name)
    : "Trợ lý du lịch bản địa";

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || isTyping || !sessionToken) return;

    const userMsg: ChatMessage = {
      id: `user-${messageIdRef.current++}`,
      sender: "guest",
      text,
      time: getCurrentTimeString(),
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);
    // Clear dynamic suggestions while waiting for next agent reply
    setDynamicSuggestions(null);

    try {
      const res = await fetch("/api/guest/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          message: text,
          language: locale,
        }),
      });

      if (res.ok) {
        const payload = await res.json();
        const replyText =
          payload?.reply ||
          payload?.data?.reply ||
          getNetworkErrorReply(locale);

        const action = (payload?.action ?? null) as GuestChatAction | null;

        const botMsg: ChatMessage = {
          id: `bot-${messageIdRef.current++}`,
          sender: "concierge",
          text: replyText,
          time: getCurrentTimeString(),
          action,
        };
        setChatHistory((prev) => [...prev, botMsg]);

        // Update dynamic quick-suggestions from agent response
        if (Array.isArray(payload?.suggestions) && payload.suggestions.length > 0) {
          setDynamicSuggestions(
            payload.suggestions
              .filter(
                (s: unknown) =>
                  s &&
                  typeof (s as { label?: unknown }).label === "string" &&
                  typeof (s as { query?: unknown }).query === "string",
              )
              .slice(0, 3)
              .map((s: { label: string; query: string }, idx: number) => ({
                id: `dynamic-${messageIdRef.current}-${idx}`,
                label: s.label,
                query: s.query,
              })),
          );
        } else {
          // Agent replied but provided no suggestions — hide the tray
          setDynamicSuggestions([]);
        }
      } else {
        const fallbackText = getNetworkErrorReply(locale);
        const botMsg: ChatMessage = {
          id: `bot-${messageIdRef.current++}`,
          sender: "concierge",
          text: fallbackText,
          time: getCurrentTimeString(),
        };
        setChatHistory((prev) => [...prev, botMsg]);
        setDynamicSuggestions([]);
      }
    } catch {
      const fallbackText = getNetworkErrorReply(locale);
      const botMsg: ChatMessage = {
        id: `bot-${messageIdRef.current++}`,
        sender: "concierge",
        text: fallbackText,
        time: getCurrentTimeString(),
      };
      setChatHistory((prev) => [...prev, botMsg]);
      setDynamicSuggestions([]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSelectSuggestion = (suggestion: QuickSuggestion) => {
    handleSendMessage(suggestion.query);
  };


  // Don't render before hydration, on full-page messages route, or before selecting language / outside guest workspace
  if (!hydrated || !hasSelectedLanguage || !isWorkspace || !hasHotelFeature(hotel?.enabledFeatures, GUEST_AI_FLOATING_CHAT)) {
    return null;
  }


  return (
    <>
      {/* Mobile Backdrop Overlay when chat is open */}
      {isOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Đóng hộp chat"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") setIsOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 sm:hidden cursor-pointer"
        />
      )}

      {/* Floating Action Button & Rectangular Tour Suggestion Box (Only visible when chat window is closed) */}
      {!isOpen && (
        <div className="fixed z-40 flex flex-col items-end gap-2.5 pointer-events-none right-3.5 bottom-[calc(5rem+14px+env(safe-area-inset-bottom,0px))] sm:bottom-8 sm:right-8">
          <AnimatePresence>
            {showTeaser && (
              <m.aside
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.94 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                aria-label="Tin nhắn tư vấn từ LocalMate AI"
                onClick={() => {
                  setIsOpen(true);
                  dismissTeaser();
                }}
                className="relative pointer-events-auto w-[calc(100vw-32px)] max-w-[276px] sm:w-[286px] rounded-2xl border border-[#b18b26]/30 bg-[#fffdfa] p-3 sm:p-3.5 text-left shadow-[0_12px_36px_rgba(27,53,46,0.18)] transition-all hover:border-[#b18b26]/60 cursor-pointer group"
              >
                {/* Speech bubble pointer pointing down directly to the button */}
                <div className="absolute -bottom-1.5 right-5 sm:right-6 h-3 w-3 rotate-45 border-b border-r border-[#b18b26]/30 bg-[#fffdfa]" />

                {/* Header: Tag, Ping & Close */}
                <div className="flex items-center justify-between gap-1 pb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10b981]" />
                    </span>
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#916e15]">
                      {uiText.teaserTag}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissTeaser();
                    }}
                    aria-label="Đóng tin nhắn"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[#8a948e] hover:bg-[#25483f]/10 hover:text-[#1b352e] cursor-pointer transition-colors"
                  >
                    <VsIcon name="close" className="text-xs" />
                  </button>
                </div>

                {/* Content */}
                <div className="pt-0.5">
                  <h4 className="text-[12px] sm:text-[12.5px] font-bold text-[#1b352e] group-hover:text-[#916e15] transition-colors leading-snug">
                    {uiText.teaserTitle}
                  </h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#55675f] line-clamp-3">
                    {uiText.teaserDesc}
                  </p>
                </div>
              </m.aside>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              dismissTeaser();
            }}
            aria-label="Mở hộp chat trợ lý du lịch bản địa LocalMate AI"
            aria-expanded={false}
            className="pointer-events-auto flex h-13 w-13 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#142823] via-[#1d3d34] to-[#2c584b] text-[#fbf9f4] ring-2 ring-[#e8b363]/85 shadow-[0_10px_28px_rgba(20,40,35,0.4)] transition-all duration-300 hover:scale-105 active:scale-90 cursor-pointer"
          >
            <span className="relative flex items-center justify-center">
              <VsIcon name="sparkles" className="text-[22px] sm:text-2xl text-[#fdfaf4]" />
              {hasUnread && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e8b363] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e8b363] ring-1.5 ring-white" />
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      {/* Floating Chat Box Window */}
      {isOpen && (
        <section
          aria-label="Hộp thoại trợ lý du lịch bản địa LocalMate AI"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(100dvh-0.75rem)] max-h-[100dvh] flex-col overflow-hidden rounded-t-[24px] border-t border-[#25483f]/25 bg-[#fffdfa] shadow-[0_-12px_44px_rgba(15,35,30,0.32)] transition-all sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[680px] sm:max-h-[min(720px,calc(100vh-48px))] sm:w-[420px] sm:rounded-3xl sm:border sm:border-[#25483f]/15"
        >
          {activeChatOrderId && sessionToken ? (
            <LocalMateOrderChat
              orderId={activeChatOrderId}
              sessionToken={sessionToken}
              onBackToAiChat={() => setActiveChatOrderId(null)}
            />
          ) : (
            <>
              {/* Header */}
              <header className="relative flex flex-col border-b border-[#25483f]/15 bg-gradient-to-r from-[#142823] via-[#1b352e] to-[#264b40] text-white shadow-sm shrink-0">
                {/* Mobile Sheet Grabber Handle */}
                <div
                  className="flex justify-center py-2 sm:hidden cursor-pointer"
                  onClick={() => setIsOpen(false)}
                >
                  <div className="h-1.5 w-12 rounded-full bg-white/30 active:bg-white/60 transition-colors" />
                </div>

                <div className="flex items-center justify-between px-4 pb-3 sm:py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#25483f] to-[#3a685b] ring-2 ring-[#e8b363]/85 shadow-[0_0_12px_rgba(232,179,99,0.3)]">
                      <VsIcon name="sparkles" className="text-xl text-[#e8b363]" />
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] ring-1.5 ring-[#142823]" />
                      </span>
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-bold tracking-wide text-white">
                        LocalMate AI
                      </h3>
                      <p className="text-[11.5px] text-[#e8e4dc]/85 flex items-center gap-1.5 mt-0.5">
                        <span className="font-medium text-[#f3eedf]">{destinationSubtitle}</span>
                        <span>•</span>
                        <span className="text-[#a7f3d0] font-medium flex items-center gap-1">
                          {uiText.readyText}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      title={uiText.closeAria}
                      aria-label={uiText.closeAria}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white/75 hover:bg-white/12 hover:text-white transition-colors cursor-pointer active:scale-90"
                    >
                      <VsIcon name="close" className="text-lg" />
                    </button>
                  </div>
                </div>
              </header>

              {/* Messages Scroll Area */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#fbf9f4] via-[#f7f3ea]/70 to-[#f2ecdf]/50 p-4 space-y-3.5 text-sm">
                <div className="text-center my-0.5">
                  <span className="inline-block rounded-full bg-[#25483f]/8 px-3.5 py-1 text-[10.5px] font-medium text-[#485a51]">
                    {uiText.bannerText}
                  </span>
                </div>

                {/* Conversation Messages */}
                {messages.map((msg) => {
                  const isGuest = msg.sender === "guest";

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isGuest ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`relative max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm transition-all ${
                          isGuest
                            ? "rounded-tr-xs bg-gradient-to-br from-[#1b352e] to-[#295045] text-[#fffdfa] shadow-[0_2px_8px_rgba(27,53,46,0.18)]"
                            : "rounded-tl-xs border border-[#25483f]/12 bg-white text-[#1b352e] shadow-[0_2px_12px_rgba(27,53,46,0.05)]"
                        }`}
                      >
                        {!isGuest && (
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#b18b26]">
                            <VsIcon name="sparkles" className="text-xs" />
                            <span>LocalMate AI</span>
                          </div>
                        )}

                        <div className="break-words space-y-1">
                          {renderFormattedMessage(msg.text)}
                        </div>

                        {!isGuest && msg.action && (
                          <LocalMateBookingCard
                            action={msg.action}
                            onBook={(act) => setSelectedBookingAction(act)}
                          />
                        )}

                        <span
                          className={`mt-1.5 block text-right text-[10.5px] ${
                            isGuest ? "text-[#fffdfa]/65" : "text-[#7a8880]"
                          }`}
                        >
                          {msg.time}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-[#5a6a62]">
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs border border-[#25483f]/12 bg-white px-3.5 py-2.5 shadow-sm">
                      <span className="text-[12px] font-medium text-[#65766e]">
                        {uiText.typing}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#25483f] [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#25483f] [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#25483f]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Suggestions Tray — dynamic from agent, fallback to localized chips */}
              {(() => {
                const hasDynamic = dynamicSuggestions && dynamicSuggestions.length > 0;
                const chipsToShow = hasDynamic ? dynamicSuggestions : suggestions;

                if (!chipsToShow || chipsToShow.length === 0) return null;

                return (
                  <div className="shrink-0 border-t border-[#25483f]/10 bg-[#fffdfa] px-3.5 pt-2.5 pb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#b18b26]">
                        <VsIcon name="sparkles" className="text-xs" />
                        {hasDynamic ? (
                          locale === "en" ? "Ask next:" :
                          locale === "zh" ? "继续提问：" :
                          locale === "ko" ? "이어서 질문:" :
                          locale === "ru" ? "Спросить далее:" :
                          locale === "hi" ? "आगे पूछें:" :
                          "Hỏi tiếp:"
                        ) : uiText.suggestionsTitle}
                      </span>
                      <span className="text-[10px] text-[#7a8880]">{uiText.suggestionsScroll}</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none overscroll-contain">
                      {chipsToShow.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectSuggestion(item)}
                          disabled={isTyping}
                          className="inline-flex shrink-0 items-center rounded-full border border-[#b18b26]/30 bg-[#b18b26]/8 px-3 py-1.5 text-[12px] font-medium text-[#654d12] shadow-2xs transition-all hover:bg-[#b18b26]/18 hover:border-[#b18b26]/60 cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="shrink-0 flex items-center gap-2 border-t border-[#25483f]/10 bg-[#fffdfa] p-3 sm:px-3.5 sm:py-3 pb-[max(12px,env(safe-area-inset-bottom))]"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={uiText.placeholder}
                  disabled={isTyping}
                  className="flex-1 min-w-0 rounded-full border border-[#25483f]/20 bg-[#f7f5ef] px-4 py-2.5 text-base sm:text-sm text-[#1b352e] placeholder:text-[#8a948e] focus:border-[#25483f] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#25483f]/20 transition-all disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  aria-label={uiText.sendAria}
                  className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b352e] to-[#2d564b] text-[#fffdfa] shadow-sm transition-all hover:from-[#142823] hover:to-[#22443b] hover:shadow-md cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <VsIcon name="send" className="text-base" />
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {/* Booking Request Dialog */}
      <LocalMateOrderRequestDialog
        action={selectedBookingAction}
        isOpen={Boolean(selectedBookingAction)}
        onClose={() => setSelectedBookingAction(null)}
        sessionToken={sessionToken ?? ""}
        onOpenChat={(orderId) => setActiveChatOrderId(orderId)}
      />
    </>
  );
}
