"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { GUEST_AI_FLOATING_CHAT, hasHotelFeature } from "@/features/hotel-features/hotel-features";
import { guestLocaleOptions } from "@/features/guest-os/i18n/config";
import type { GuestChatAction } from "@/features/marketplace/types/marketplace-contract";
import {
  getLocalMateChatUiText,
  getLocalMateNetworkErrorReply,
  getLocalMateWelcomeMessage,
  SUGGESTIONS_BY_LOCALE,
  type QuickSuggestion,
} from "@/features/localmate-chat/localmate-chat-copy";
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



function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}


function renderFormattedMessage(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ");
    const content = isBullet ? trimmed.slice(2) : line;

    let formattedContent = content;
    const landmarkMatch = content.match(/^([^:\n*]{2,70})\s*:\s*(.*)$/);
    if (isBullet && landmarkMatch && !content.startsWith("**")) {
      formattedContent = `**${landmarkMatch[1].trim()}**: ${landmarkMatch[2]}`;
    }

    const parts = formattedContent.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

    return (
      <span
        key={lineIdx}
        className={`block min-h-[1.3em] ${
          isBullet ? "flex items-start gap-1.5 pl-1 my-0.5" : ""
        }`}
      >
        {isBullet && (
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1b352e]/60" />
        )}
        <span className="flex-1">
          {parts.map((part, partIdx) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={partIdx} className="font-bold text-[#142823]">
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
  const { locale, setLocale } = useGuestI18n();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const isWorkspace = isGuestWorkspaceRoute(pathname);
  const hasSelectedLanguage = Boolean(language);

  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [showTeaser, setShowTeaser] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Dynamic suggestions from agent — null = show static chips, [] = hide tray, [...] = show agent chips
  const [dynamicSuggestions, setDynamicSuggestions] = useState<QuickSuggestion[] | null>(null);

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const currentOption = useMemo(
    () => guestLocaleOptions.find((opt) => opt.code === locale) || guestLocaleOptions[0],
    [locale]
  );

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [langMenuOpen]);

  const uiText = useMemo(() => getLocalMateChatUiText(locale), [locale]);
  const suggestions = useMemo(
    () => SUGGESTIONS_BY_LOCALE[locale] || SUGGESTIONS_BY_LOCALE.en || SUGGESTIONS_BY_LOCALE.vi,
    [locale]
  );

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedBookingAction, setSelectedBookingAction] = useState<GuestChatAction | null>(null);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);

  const [welcomeMessage] = useState<ChatMessage>(() => ({
    id: "welcome-init",
    sender: "concierge",
    text: getLocalMateWelcomeMessage(locale, guest?.displayName),
    time: getCurrentTimeString(),
  }));

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
          getLocalMateNetworkErrorReply(locale);

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
        const fallbackText = getLocalMateNetworkErrorReply(locale);
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
      const fallbackText = getLocalMateNetworkErrorReply(locale);
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
          aria-label={uiText.closeAria}
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
                aria-label={uiText.teaserAria}
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
                    aria-label={uiText.dismissTeaserAria}
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
            aria-label={uiText.openAria}
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
          aria-label={uiText.bannerText}
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

                  <div className="flex items-center gap-1.5">
                    {/* Language Switcher in Guest Floating Chat Header */}
                    <div className="relative" ref={langMenuRef}>
                      <button
                        type="button"
                        onClick={() => setLangMenuOpen((prev) => !prev)}
                        aria-label={uiText.selectLanguageAria}
                        aria-expanded={langMenuOpen}
                        title={currentOption.nativeName}
                        className="flex h-9 items-center gap-1.5 rounded-full border border-[#e8b363]/80 bg-[#142823]/80 px-2.5 sm:px-3 text-xs font-bold text-white shadow-md backdrop-blur-sm transition-all hover:bg-[#142823] hover:border-[#fde4aa] hover:ring-2 hover:ring-[#e8b363]/30 active:scale-95 cursor-pointer"
                      >
                        <VsIcon name="globe" className="text-sm text-[#e8b363] shrink-0" />
                        <span className="font-bold text-xs text-[#fde4aa] tracking-wide">{currentOption.nativeName}</span>
                        <span className="text-[9px] text-[#fde4aa]/80" aria-hidden="true">{langMenuOpen ? "▴" : "▾"}</span>
                      </button>

                      {langMenuOpen && (
                        <ul
                          role="listbox"
                          aria-label={uiText.selectLanguageAria}
                          className="absolute right-0 top-full mt-2 z-50 w-48 overflow-hidden rounded-2xl border border-[#25483f]/20 bg-white p-1.5 text-[#1b352e] shadow-2xl shadow-black/30 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
                        >
                          {guestLocaleOptions.map((opt) => (
                            <li key={opt.code} role="option" aria-selected={opt.code === locale}>
                              <button
                                type="button"
                                onClick={() => {
                                  setLocale(opt.code);
                                  setLangMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                                  opt.code === locale
                                    ? "bg-[#25483f] font-semibold text-white shadow-sm"
                                    : "text-[#1b352e] hover:bg-[#f7f3ea]"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <VsIcon name="globe" className="text-xs text-[#25483f] shrink-0" />
                                  <span className="font-semibold">{opt.nativeName}</span>
                                </span>
                                <span
                                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                                    opt.code === locale
                                      ? "bg-[#e8b363]/25 text-[#fde4aa]"
                                      : "bg-black/5 text-[#485a51]"
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
