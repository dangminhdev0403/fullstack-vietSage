"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import type { GuestLocale } from "@/features/guest-os/i18n/config";

type ChatMessage = {
  id: string;
  sender: "guest" | "concierge";
  text: string;
  time: string;
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
      id: "tour_mcc",
      label: "🌾 Tour Mù Cang Chải",
      query: "Gợi ý cho tôi các tour du lịch Mù Cang Chải ruộng bậc thang đẹp nhất",
    },
    {
      id: "hotspring",
      label: "♨️ Khoáng nóng Trạm Tấu",
      query: "Trạm Tấu có suối khoáng nóng và điểm săn mây nào nổi bật?",
    },
    {
      id: "guide",
      label: "🧭 Hướng dẫn viên bản địa",
      query: "Tôi muốn tìm hiểu các bạn LocalMate hướng dẫn viên bản địa ở Tây Bắc",
    },
    {
      id: "clean",
      label: "🛎️ Dọn phòng",
      query: "Tôi cần hỗ trợ dọn phòng bây giờ",
    },
    {
      id: "water",
      label: "💧 Thêm nước suối",
      query: "Cho tôi xin thêm nước suối lên phòng nhé",
    },
    {
      id: "towel",
      label: "🧴 Khăn tắm & đồ dùng",
      query: "Phòng tôi cần thêm khăn tắm và bộ đồ dùng cá nhân",
    },
    {
      id: "wifi",
      label: "📶 Mật khẩu Wi-Fi",
      query: "Cho tôi xin thông tin kết nối Wi-Fi của khách sạn",
    },
    {
      id: "checkout",
      label: "⏰ Giờ trả phòng?",
      query: "Giờ trả phòng tiêu chuẩn của khách sạn là mấy giờ vậy?",
    },
  ],
  en: [
    {
      id: "tour_mcc",
      label: "🌾 Mu Cang Chai Tours",
      query: "Can you recommend the best terraced rice fields tours in Mu Cang Chai?",
    },
    {
      id: "hotspring",
      label: "♨️ Tram Tau Hot Springs",
      query: "What are the top hot springs and cloud hunting spots in Tram Tau?",
    },
    {
      id: "guide",
      label: "🧭 Native Local Guides",
      query: "Are there any verified English-speaking LocalMate native guides available?",
    },
    {
      id: "clean",
      label: "🛎️ Housekeeping",
      query: "I would like to request room cleaning now please",
    },
    {
      id: "water",
      label: "💧 Extra Water Bottles",
      query: "Could I have extra drinking water sent to my room?",
    },
    {
      id: "towel",
      label: "🧴 Fresh Towels & Amenities",
      query: "We need extra fresh towels and personal care amenities",
    },
    {
      id: "wifi",
      label: "📶 Wi-Fi Details",
      query: "What is the Wi-Fi network and password for hotel guests?",
    },
    {
      id: "checkout",
      label: "⏰ Check-out Time?",
      query: "What is the standard check-out time?",
    },
  ],
  zh: [
    {
      id: "tour_mcc",
      label: "🌾 木江界梯田行程",
      query: "请推荐木江界最美的梯田旅游线路",
    },
    {
      id: "hotspring",
      label: "♨️ 站凑温泉与云海",
      query: "站凑有哪些著名的天然温泉和云海徒步点？",
    },
    {
      id: "guide",
      label: "🧭 当地认证向导",
      query: "我想了解越南西北部的原生 LocalMate 认证向导",
    },
    {
      id: "clean",
      label: "🛎️ 房间清洁",
      query: "请现在安排客房打扫服务",
    },
    {
      id: "water",
      label: "💧 补充矿泉水",
      query: "请帮我送饮用水到房间",
    },
    {
      id: "wifi",
      label: "📶 Wi-Fi 密码",
      query: "请问酒店客房 Wi-Fi 名称和密码是什么？",
    },
    {
      id: "checkout",
      label: "⏰ 退房时间？",
      query: "请问标准退房时间是几点？",
    },
  ],
  ko: [
    {
      id: "tour_mcc",
      label: "🌾 무깡차이 투어",
      query: "무깡차이 계단식 논 추천 투어 일정을 알려주세요",
    },
    {
      id: "hotspring",
      label: "♨️ 짬따우 온천/운해",
      query: "짬따우 온천과 운해 트레킹 명소를 추천해 주세요",
    },
    {
      id: "guide",
      label: "🧭 현지 로컬 가이드",
      query: "현지 로컬 가이드(LocalMate)를 예약하고 싶습니다",
    },
    {
      id: "clean",
      label: "🛎️ 객실 청소",
      query: "지금 객실 청소를 요청합니다",
    },
    {
      id: "water",
      label: "💧 생수 추가",
      query: "생수를 객실로 가져다주세요",
    },
    {
      id: "wifi",
      label: "📶 Wi-Fi 비밀번호",
      query: "호텔 Wi-Fi 접속 정보를 알려주세요",
    },
  ],
  ru: [
    {
      id: "tour_mcc",
      label: "🌾 Туры в Мукангчай",
      query: "Порекомендуйте лучшие туры по рисовым террасам в Мукангчае",
    },
    {
      id: "hotspring",
      label: "♨️ Источники Чамтау",
      query: "Какие горячие источники и смотровые площадки есть в Чамтау?",
    },
    {
      id: "guide",
      label: "🧭 Местные гиды",
      query: "Как забронировать местного англоговорящего гида LocalMate?",
    },
    {
      id: "clean",
      label: "🛎️ Уборка номера",
      query: "Пожалуйста, проведите уборку в номере прямо сейчас",
    },
    {
      id: "water",
      label: "💧 Питьевая вода",
      query: "Принесите, пожалуйста, дополнительную питьевую воду в номер",
    },
    {
      id: "wifi",
      label: "📶 Пароль Wi-Fi",
      query: "Подскажите название сети и пароль от Wi-Fi",
    },
    {
      id: "checkout",
      label: "⏰ Время выезда",
      query: "Какое стандартное время выезда из отеля?",
    },
  ],
  hi: [
    {
      id: "tour_mcc",
      label: "🌾 मु कांग चाई टूर",
      query: "मु कांग चाई सीढ़ीदार खेतों के सर्वोत्तम टूर की सिफारिश करें",
    },
    {
      id: "hotspring",
      label: "♨️ ट्राम ताउ हॉट स्प्रिंग्स",
      query: "ट्राम ताउ में प्रसिद्ध गर्म पानी के झरने कौन से हैं?",
    },
    {
      id: "guide",
      label: "🧭 स्थानीय गाइड",
      query: "क्या स्थानीय LocalMate गाइड उपलब्ध हैं?",
    },
    {
      id: "clean",
      label: "🛎️ कमरा सफाई",
      query: "कृपया मेरे कमरे की सफाई करवाएं",
    },
    {
      id: "water",
      label: "💧 अतिरिक्त पानी",
      query: "कृपया कमरे में पीने का पानी भेजें",
    },
    {
      id: "wifi",
      label: "📶 Wi-Fi विवरण",
      query: "होटल Wi-Fi का नाम और पासवर्ड क्या है?",
    },
    {
      id: "checkout",
      label: "⏰ चेक-आउट समय",
      query: "मानक चेक-आउट समय क्या है?",
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
      return `Hello${name}! I'm **LocalMate AI & VietSage Concierge**. 🌿\n\nI'm ready 24/7 to assist you with room amenities, Northwest Vietnam local travel itineraries, or native guide connections. How can I help you today?`;
    case "zh":
      return `您好${name}！我是 **LocalMate AI & VietSage 礼宾助理**。🌿\n\n我全天候 24/7 为您提供客房服务支持、西北原生体验线路及当地向导预约。今天有什么我可以协助您的吗？`;
    case "ko":
      return `안녕하세요${name}님! **LocalMate AI & VietSage 컨시어지**입니다. 🌿\n\n객실 서비스, 베트남 북서부 여행 일정 및 현지 로컬 가이드 연결을 24시간 지원해 드립니다. 오늘 어떤 도움이 필요하신가요?`;
    case "ru":
      return `Здравствуйте${name}! Я **LocalMate AI & консьерж VietSage**. 🌿\n\nЯ готов круглосуточно помочь вам с услугами номера, маршрутами по северо-западу Вьетнама и местными гидами. Чем я могу вам помочь?`;
    case "hi":
      return `नमस्ते${name}! मैं **LocalMate AI और VietSage कंसीयज** हूँ। 🌿\n\nकमरे की सेवाओं और स्थानीय पर्यटन मार्गदर्शन के लिए मैं 24/7 उपलब्ध हूँ। आज मैं आपकी क्या सहायता कर सकता हूँ?`;
    default:
      return `Dạ xin chào${name}! Em là **LocalMate AI & Trợ lý Lễ tân VietSage**. 🌿\n\nEm luôn sẵn sàng hỗ trợ Quý khách 24/7 về các dịch vụ phòng, lịch trình du lịch bản địa Tây Bắc hoặc kết nối hướng dẫn viên. Quý khách cần hỗ trợ gì hôm nay ạ?`;
  }
}

function getChatUiText(locale: GuestLocale) {
  switch (locale) {
    case "en":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "Need travel tips or room assistance?",
        teaserDesc: "I can suggest local experiences, connect native guides, or assist with room requests!",
        readyText: "Online",
        bannerText: "Local Travel Assistant & 24/7 Concierge",
        typing: "LocalMate is composing an answer...",
        suggestionsTitle: "Quick suggestions:",
        suggestionsScroll: "Swipe horizontally",
        placeholder: "Ask about tours, guides, room services, Wi-Fi...",
        sendAria: "Send message",
        closeAria: "Minimize chat",
      };
    case "zh":
      return {
        teaserTag: "✨ LocalMate 助理",
        teaserTitle: "需要行程推荐或客房服务吗？",
        teaserDesc: "我可以为您推荐特色体验、对接当地向导，或随时协助各项客房需求！",
        readyText: "在线",
        bannerText: "原生旅游助理 & 24小时礼宾服务",
        typing: "LocalMate 正在撰写回复...",
        suggestionsTitle: "为您推荐的快速提问：",
        suggestionsScroll: "左右滑动查看更多",
        placeholder: "咨询旅游线路、向导、客房用品、Wi-Fi...",
        sendAria: "发送消息",
        closeAria: "收起聊天窗口",
      };
    case "ko":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "여행 추천이나 객실 서비스가 필요하신가요?",
        teaserDesc: "맞춤 투어 추천, 현지 가이드 연결 및 객실 요청을 언제든 도와드립니다!",
        readyText: "온라인",
        bannerText: "현지 여행 비서 & 24시간 컨시어지",
        typing: "LocalMate가 답변 작성 중...",
        suggestionsTitle: "빠른 질문 선택:",
        suggestionsScroll: "가로로 스크롤하여 더 보기",
        placeholder: "투어 일정, 가이드, 객실 비품, Wi-Fi 문의...",
        sendAria: "메시지 전송",
        closeAria: "채팅 닫기",
      };
    case "ru":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "Нужна помощь с турами или номером?",
        teaserDesc: "Я помогу подобрать маршрут, найти гида или организовать обслуживание в номере!",
        readyText: "В сети",
        bannerText: "Местный гид и круглосуточный консьерж",
        typing: "LocalMate печатает ответ...",
        suggestionsTitle: "Быстрые подсказки:",
        suggestionsScroll: "Прокрутите для просмотра",
        placeholder: "Спросите о турах, услугах номера, Wi-Fi...",
        sendAria: "Отправить сообщение",
        closeAria: "Закрыть чат",
      };
    case "hi":
      return {
        teaserTag: "✨ LocalMate AI",
        teaserTitle: "यात्रा योजना या कमरे की सेवा चाहिए?",
        teaserDesc: "मैं आपको विशेष टूर, स्थानीय गाइड या कमरा सेवाओं में मदद कर सकता हूँ!",
        readyText: "ऑनलाइन",
        bannerText: "स्थानीय यात्रा सहायक और 24/7 कंसीयज",
        typing: "LocalMate उत्तर लिख रहा है...",
        suggestionsTitle: "त्वरित सुझाव:",
        suggestionsScroll: "अधिक देखने के लिए स्वाइप करें",
        placeholder: "टूर, कमरे की सेवा या Wi-Fi के बारे में पूछें...",
        sendAria: "संदेश भेजें",
        closeAria: "चैट बंद करें",
      };
    default:
      return {
        teaserTag: "✨ Trợ lý LocalMate",
        teaserTitle: "Cần tư vấn lịch trình & dịch vụ?",
        teaserDesc: "Em có thể gợi ý tour trải nghiệm, kết nối hướng dẫn viên hoặc hỗ trợ dịch vụ phòng cho Quý khách!",
        readyText: "Trực tuyến",
        bannerText: "Trợ lý du lịch bản địa & Lễ tân 24/7",
        typing: "LocalMate đang soạn câu trả lời...",
        suggestionsTitle: "Gợi ý nhanh cho bạn:",
        suggestionsScroll: "Vuốt ngang xem thêm",
        placeholder: "Hỏi về tour, hướng dẫn viên, tiện ích phòng, Wi-Fi...",
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

  // Floating teaser message appears after selecting language / entering guest workspace
  useEffect(() => {
    if (!hasSelectedLanguage || !isWorkspace) {
      setShowTeaser(false);
      return;
    }

    // Delay entrance slightly so guest sees the workspace before being greeted
    const showTimer = setTimeout(() => {
      setShowTeaser(true);
    }, 800);

    // Auto-dismiss teaser after 12 seconds
    const hideTimer = setTimeout(() => {
      setShowTeaser(false);
    }, 12800);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [hasSelectedLanguage, isWorkspace, locale]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setHasUnread(false);
        setShowTeaser(false);
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const roomLabel = room?.roomNumber
    ? `Phòng ${room.roomNumber}`
    : hotel?.name
      ? hotel.name
      : "VietSage Concierge 24/7";

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

        const botMsg: ChatMessage = {
          id: `bot-${messageIdRef.current++}`,
          sender: "concierge",
          text: replyText,
          time: getCurrentTimeString(),
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
  if (!hydrated || !hasSelectedLanguage || !isWorkspace) {
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
        <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2.5 pointer-events-none sm:bottom-8 sm:right-8">
          <AnimatePresence>
            {showTeaser && (
              <m.aside
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.94 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                aria-label="Tin nhắn tư vấn từ LocalMate AI"
                onClick={() => {
                  setIsOpen(true);
                  setShowTeaser(false);
                }}
                className="relative pointer-events-auto w-[268px] sm:w-[286px] rounded-2xl border border-[#b18b26]/30 bg-[#fffdfa] p-3.5 text-left shadow-[0_12px_36px_rgba(27,53,46,0.18)] transition-all hover:border-[#b18b26]/60 cursor-pointer group"
              >
                {/* Speech bubble pointer pointing down directly to the button */}
                <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-[#b18b26]/30 bg-[#fffdfa]" />

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
                      setShowTeaser(false);
                    }}
                    aria-label="Đóng tin nhắn"
                    className="rounded-md p-1 text-[#8a948e] hover:bg-[#25483f]/10 hover:text-[#1b352e] cursor-pointer transition-colors"
                  >
                    <VsIcon name="close" className="text-xs" />
                  </button>
                </div>

                {/* Content */}
                <div className="pt-1">
                  <h4 className="text-[12.5px] font-bold text-[#1b352e] group-hover:text-[#916e15] transition-colors leading-snug">
                    {uiText.teaserTitle}
                  </h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#55675f]">
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
              setShowTeaser(false);
            }}
            aria-label="Mở hộp chat hỗ trợ lễ tân và LocalMate AI"
            aria-expanded={false}
            className="pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#142823] via-[#1d3d34] to-[#2c584b] text-[#fbf9f4] ring-2 ring-[#e8b363]/80 shadow-[0_12px_32px_rgba(20,40,35,0.4)] transition-all duration-300 hover:scale-105 active:scale-90 cursor-pointer"
          >
            <span className="relative flex items-center justify-center">
              <VsIcon name="chat" className="text-2xl text-[#fdfaf4]" />
              {hasUnread && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center">
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
          aria-label="Hộp thoại tin nhắn lễ tân và LocalMate AI"
          className="fixed inset-x-0 bottom-0 top-3 z-50 flex flex-col overflow-hidden rounded-t-[28px] border-t border-[#25483f]/25 bg-[#fffdfa] shadow-[0_-12px_44px_rgba(15,35,30,0.32)] transition-all sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[680px] sm:max-h-[min(720px,calc(100vh-48px))] sm:rounded-3xl sm:border sm:border-[#25483f]/15"
        >
          {/* Header */}
          <header className="relative flex flex-col border-b border-[#25483f]/15 bg-gradient-to-r from-[#142823] via-[#1b352e] to-[#264b40] text-white shadow-sm">
            {/* Mobile Sheet Grabber Handle */}
            <div
              className="flex justify-center pt-2 pb-0.5 sm:hidden cursor-pointer"
              onClick={() => setIsOpen(false)}
            >
              <div className="h-1.5 w-12 rounded-full bg-white/30 active:bg-white/60 transition-colors" />
            </div>

            <div className="flex items-center justify-between px-4 py-3 sm:py-3.5">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#25483f] to-[#3a685b] ring-2 ring-[#e8b363]/85 shadow-[0_0_12px_rgba(232,179,99,0.3)]">
                  <VsIcon name="support_agent" className="text-xl text-[#e8b363]" />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] ring-1.5 ring-[#142823]" />
                  </span>
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold tracking-wide text-white">
                    VietSage Concierge
                  </h3>
                  <p className="text-[11.5px] text-[#e8e4dc]/85 flex items-center gap-1.5 mt-0.5">
                    <span className="font-medium text-[#f3eedf]">{roomLabel}</span>
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
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 hover:bg-white/12 hover:text-white transition-colors cursor-pointer active:scale-90"
                >
                  <VsIcon name="close" className="text-lg" />
                </button>
              </div>
            </div>
          </header>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#fbf9f4] via-[#f7f3ea]/70 to-[#f2ecdf]/50 p-4 space-y-3.5 text-sm">
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
                    className={`relative max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed shadow-sm transition-all ${
                      isGuest
                        ? "rounded-tr-xs bg-gradient-to-br from-[#1b352e] to-[#295045] text-[#fffdfa] shadow-[0_2px_8px_rgba(27,53,46,0.18)]"
                        : "rounded-tl-xs border border-[#25483f]/12 bg-white text-[#1b352e] shadow-[0_2px_12px_rgba(27,53,46,0.05)]"
                    }`}
                  >
                    {!isGuest && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#b18b26]">
                        <VsIcon name="sparkles" className="text-xs" />
                        <span>LocalMate Concierge</span>
                      </div>
                    )}

                    <div className="break-words space-y-1">
                      {renderFormattedMessage(msg.text)}
                    </div>

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

          {/* Quick Suggestions Tray — dynamic from agent, static at welcome */}
          {(() => {
            // Determine which chips to show
            const isWelcome = dynamicSuggestions === null;
            const chipsToShow = isWelcome ? suggestions : dynamicSuggestions;

            // Hide tray entirely when agent returned no suggestions
            if (!isWelcome && (!chipsToShow || chipsToShow.length === 0)) return null;

            return (
              <div className="border-t border-[#25483f]/10 bg-[#fffdfa] px-3.5 pt-2.5 pb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#b18b26]">
                    <VsIcon name="sparkles" className="text-xs" />
                    {isWelcome ? uiText.suggestionsTitle : (
                      locale === "en" ? "Ask next:" :
                      locale === "zh" ? "继续提问：" :
                      locale === "ko" ? "이어서 질문:" :
                      locale === "ru" ? "Спросить далее:" :
                      locale === "hi" ? "आगे पूछें:" :
                      "Hỏi tiếp:"
                    )}
                  </span>
                  {isWelcome && (
                    <span className="text-[10px] text-[#7a8880]">{uiText.suggestionsScroll}</span>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {(chipsToShow ?? []).map((item) => (
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
            className="flex items-center gap-2.5 border-t border-[#25483f]/10 bg-[#fffdfa] px-3.5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={uiText.placeholder}
              disabled={isTyping}
              className="flex-1 rounded-full border border-[#25483f]/20 bg-[#f7f5ef] px-4 py-2.5 text-[15px] sm:text-sm text-[#1b352e] placeholder:text-[#8a948e] focus:border-[#25483f] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#25483f]/20 transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              aria-label={uiText.sendAria}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b352e] to-[#2d564b] text-[#fffdfa] shadow-sm transition-all hover:from-[#142823] hover:to-[#22443b] hover:shadow-md cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <VsIcon name="send" className="text-base" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
