"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { publicLocalMateResource } from "../resource";
import type { PublicLocalMateSuggestion } from "../types";
import { writePublicBookingHandoff } from "../public-booking-handoff";
import {
  type DestinationRegion,
  POPULAR_DESTINATIONS,
  REGION_TABS,
  VIETNAM_PROVINCES,
} from "../constants/locations";

type Message = { id: number; sender: "guest" | "localmate"; text: string };

const welcome: Message = {
  id: 0,
  sender: "localmate",
  text: "Dạ em là LocalMate AI — trợ lý du lịch bản địa của VietSage. Quý khách đang dừng chân hoặc dự định khám phá khu vực nào ạ?",
};

const initialDiscoveryQuery = "Gợi ý các địa danh và trải nghiệm nổi bật gần đây";

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
    <div className="space-y-1.5 break-words">
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <span key={lineIndex} className="block h-1.5" />;
        }

        // Bullet or numbered item (e.g. "- ...", "* ...", "• ...", "1. ...")
        const bulletMatch = trimmed.match(/^([-•*]|\d+[.)])\s+(.*)$/);
        if (bulletMatch) {
          const body = bulletMatch[2];
          // Detect landmark or title before a colon (e.g. "**Hoàng Thành Thăng Long**: ..." or "Hoàng Thành Thăng Long: ...")
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

        // Standard text paragraph
        return (
          <p key={lineIndex} className="leading-relaxed">
            {renderInlineFormatting(line, isGuest)}
          </p>
        );
      })}
    </div>
  );
}

export function PublicLocalMateChat() {
  const mutation = useMutation(publicLocalMateResource.bind({}).mutations.chat.options());
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [suggestions, setSuggestions] = useState<PublicLocalMateSuggestion[]>([]);
  const [hasBookingHandoff, setHasBookingHandoff] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<DestinationRegion>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const teaserRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const openerKindRef = useRef<"teaser" | "button">("button");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const displayedDestinations = useMemo(() => {
    if (selectedRegion === "all") {
      return POPULAR_DESTINATIONS.filter((d) => d.popular);
    }
    return POPULAR_DESTINATIONS.filter((d) => d.region === selectedRegion);
  }, [selectedRegion]);

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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        window.setTimeout(
          () => (openerKindRef.current === "teaser" ? teaserRef.current : openButtonRef.current)?.focus(),
          0,
        );
        return;
      }
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Keep focus inside the modal; avoid focusing a text field on touch devices.
    const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const timer = window.setTimeout(
      () => (!isTouch && location ? inputRef.current : closeButtonRef.current)?.focus(),
      80,
    );

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, location]);

  useEffect(() => {
    if (!isOpen) return;

    // In initial greeting state, ensure user sees the top message and options
    if (!location && messages.length <= 1) {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = 0;
      }
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, messages, mutation.isPending, location]);

  const send = async (suggested?: string, locationOverride?: string, guestText?: string) => {
    const message = (suggested ?? input).trim();
    const activeLocation = locationOverride ?? location;
    if (!activeLocation || !message || mutation.isPending) return;

    setMessages((current) => [
      ...current,
      { id: nextId.current++, sender: "guest", text: guestText ?? message },
    ]);
    setInput("");
    setSuggestions([]);

    try {
      const sanitizedHistory = messages
        .filter(
          (m) =>
            m.id !== 0 &&
            !m.text.includes("kết nối nguồn tri thức đang gián đoạn") &&
            !m.text.includes("trình duyệt đang chặn"),
        )
        .slice(-8)
        .map(({ sender, text }) => ({
          role: sender,
          text: text.trim().slice(0, 1_000),
        }));

      const result = await mutation.mutateAsync({
        input: {
          message,
          location: activeLocation,
          language: "vi",
          history: sanitizedHistory,
        },
      });
      setMessages((current) => [
        ...current,
        { id: nextId.current++, sender: "localmate", text: result.reply },
      ]);
      setSuggestions(result.suggestions);
      if (result.action) {
        const stored = writePublicBookingHandoff(window.localStorage, {
          candidateKey: result.action.candidateKey,
        });
        setHasBookingHandoff(stored);
        if (!stored) {
          setMessages((current) => [
            ...current,
            {
              id: nextId.current++,
              sender: "localmate",
              text: "Dạ trình duyệt đang chặn lưu phiên đặt tour. Quý khách vui lòng mở GuestOS từ mã QR phòng rồi chốt lại giúp em ạ.",
            },
          ]);
        }
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          sender: "localmate",
          text: "Dạ kết nối nguồn tri thức đang gián đoạn. Quý khách vui lòng thử lại sau ít phút ạ.",
        },
      ]);
    }
  };

  const saveLocation = (targetLocation?: string) => {
    const value = (targetLocation ?? locationInput).trim();
    if (value.length < 2 || value.length > 120) {
      setLocationError("Vui lòng nhập hoặc chọn địa điểm từ 2 đến 120 ký tự.");
      return;
    }

    const isQuestionOrPrompt =
      !targetLocation &&
      (value.includes("?") ||
        value.length > 20 ||
        /^(hỏi|cho|gợi ý|ăn gì|chơi gì|ở đâu|lịch trình|tìm|muốn|khám phá|tư vấn|review|quán)/i.test(value));

    let activeLocation = value;
    let messageToSend = initialDiscoveryQuery;
    let displayText = value;

    if (isQuestionOrPrompt) {
      const matchedDest = POPULAR_DESTINATIONS.find((d) =>
        value.toLowerCase().includes(d.name.toLowerCase()),
      );
      const matchedProv = !matchedDest
        ? VIETNAM_PROVINCES.find((p) => value.toLowerCase().includes(p.toLowerCase()))
        : undefined;

      const detected = matchedDest?.name ?? matchedProv;
      if (detected) {
        activeLocation = detected;
      }
      messageToSend = value;
      displayText = value;
    }

    setLocation(activeLocation);
    setLocationInput(activeLocation);
    setLocationError("");
    void send(messageToSend, activeLocation, displayText);
  };

  const changeLocation = () => {
    setLocation("");
    setLocationInput("");
    setLocationError("");
    setInput("");
    setSuggestions([]);
    setSelectedRegion("all");
    setMessages([
      {
        ...welcome,
        id: nextId.current++,
        text: "Dạ Quý khách muốn em tư vấn cho khu vực nào ạ? Vui lòng chọn bên dưới hoặc nhập quận, thành phố, tỉnh mới.",
      },
    ]);
  };

  const openChat = (opener: "teaser" | "button") => {
    openerKindRef.current = opener;
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsOpen(false);
    window.setTimeout(
      () => (openerKindRef.current === "teaser" ? teaserRef.current : openButtonRef.current)?.focus(),
      0,
    );
  };

  return (
    <div className="fixed bottom-4 right-3 z-50 sm:bottom-7 sm:right-7">
      {isOpen ? (
        <>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Đóng LocalMate AI"
            className="fixed inset-0 -z-10 bg-black/35 backdrop-blur-[2px] sm:hidden"
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="LocalMate AI tư vấn du lịch bản địa"
            className="flex h-[min(620px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-[#d6c08b]/55 bg-[#fffdf8] shadow-[0_24px_70px_rgba(18,61,42,0.24)] sm:rounded-3xl"
          >
          <header className="relative flex shrink-0 items-center justify-between bg-gradient-to-r from-[#123d2a] to-[#245942] px-4 py-3 text-white sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3c66b]/15 ring-1 ring-[#f3c66b]/65 sm:h-11 sm:w-11">
                <VsIcon name="sparkles" className="text-xl text-[#f3c66b] sm:text-2xl" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] ring-1 ring-[#123d2a]" />
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold leading-tight sm:text-base">LocalMate AI</h2>
                <p className="flex items-center gap-1.5 truncate text-[11.5px] text-white/80 sm:text-[12.5px]">
                  <span className="font-medium text-[#a7f3d0]">Trực tuyến</span>
                  <span className="text-white/40">•</span>
                  <span className="truncate">{location || "Tri thức du lịch bản địa"}</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {location && (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={changeLocation}
                  className="min-h-10 rounded-full px-2.5 text-xs font-semibold text-[#f3c66b] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3c66b] sm:min-h-11 sm:px-3 sm:text-sm"
                >
                  Đổi vị trí
                </button>
              )}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeChat}
                aria-label="Đóng LocalMate AI"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3c66b] sm:h-11 sm:w-11"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>
          </header>

          <div
            ref={messagesContainerRef}
            className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#f8f4ea] to-[#f2ecdf]/60 p-3.5 sm:p-4"
            aria-live="polite"
          >
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === "guest" ? "justify-end" : "justify-start"}`}>
                {message.sender === "localmate" && (
                  <span className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10">
                    <VsIcon name="sparkles" className="text-sm text-[#2a6649]" />
                  </span>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-sm sm:text-[14.5px] ${
                    message.sender === "guest"
                      ? "rounded-tr-sm bg-gradient-to-br from-[#123d2a] to-[#1e5038] text-white"
                      : "rounded-tl-sm border border-[#123d2a]/10 bg-white text-[#24342b]"
                  }`}
                >
                  {renderMessageContent(message.text, message.sender === "guest")}
                </div>
              </div>
            ))}
            {!location && (
              <div className="space-y-3 rounded-2xl border border-[#d6c08b]/45 bg-white/95 p-3.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#d6c08b]/20 pb-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[#123d2a]">
                    <VsIcon name="location_on" className="text-sm text-[#b8872f]" />
                    Gợi ý điểm đến phổ biến
                  </span>
                  <span className="text-[11px] font-medium text-[#627064]">Chạm để chọn nhanh</span>
                </div>

                {/* Region filter tabs */}
                <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none" role="tablist" aria-label="Lọc theo miền">
                  {REGION_TABS.map((tab) => {
                    const isActive = selectedRegion === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setSelectedRegion(tab.id)}
                        className={`min-h-[30px] shrink-0 rounded-full px-2.5 text-[11.5px] font-semibold transition active:scale-95 ${
                          isActive
                            ? "bg-[#123d2a] text-[#f3c66b] shadow-sm"
                            : "bg-[#f8f4ea] text-[#4a5e52] hover:bg-[#ebdcc0] hover:text-[#123d2a]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Suggestion pills grid */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {displayedDestinations.map((dest) => (
                    <button
                      key={dest.name}
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => saveLocation(dest.name)}
                      className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#d6c08b]/40 bg-[#fffdf8] px-2.5 py-1.5 text-[12px] font-medium text-[#1e3428] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-[#123d2a] hover:bg-[#123d2a] hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#b8872f] sm:px-3 sm:text-[12.5px]"
                    >
                      <span className="shrink-0 text-sm leading-none">{dest.icon}</span>
                      <span className="truncate">{dest.name}</span>
                      {dest.tag && (
                        <span className="shrink-0 text-[10px] text-[#85642a] group-hover:text-white/80 sm:text-[10.5px]">
                          • {dest.tag}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mutation.isPending && (
              <div className="flex items-center gap-2">
                <span className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10">
                  <VsIcon name="sparkles" className="text-sm text-[#2a6649]" />
                </span>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-[#123d2a]/10 bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm text-[#627064]">LocalMate đang soạn</span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2a6649] [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2a6649] [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#2a6649]" />
                  </span>
                </div>
              </div>
            )}
            {hasBookingHandoff && (
              <Link
                href="/g/home"
                className="ml-9 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-[#184d35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f]"
              >
                <VsIcon name="qr_code" className="text-lg" />
                Tiếp tục xác thực phòng và tạo QR thanh toán
              </Link>
            )}
            <div ref={messagesEndRef} />
          </div>

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
                  className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[#123d2a]"
                >
                  <VsIcon name="location_on" className="text-sm text-[#b8872f]" />
                  Hoặc nhập địa phương muốn khám phá:
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
                    placeholder="Ví dụ: Hoàn Kiếm, Quận 1, Quy Nhơn..."
                    autoComplete="off"
                    aria-describedby={locationError ? "localmate-location-error" : undefined}
                    aria-label="Địa phương muốn khám phá"
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-base text-[#132119] outline-none transition placeholder:text-[#8a9890] focus:border-[#123d2a] focus:bg-white focus:ring-2 focus:ring-[#123d2a]/15 sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!locationInput.trim() || locationInput.trim().length < 2 || mutation.isPending}
                    aria-label="Gửi địa điểm hoặc câu hỏi"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123d2a] sm:px-4.5"
                  >
                    <span>Gửi</span>
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
                      disabled={mutation.isPending}
                      onClick={() => void send(suggestion.query)}
                      className="min-h-10 shrink-0 rounded-full border border-[#b8872f]/35 bg-[#fff7df] px-3.5 text-xs font-semibold text-[#735c00] transition hover:border-[#b8872f] hover:bg-[#fef0cb] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123d2a] sm:min-h-11 sm:px-4 sm:text-sm"
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
                  placeholder={`Hỏi về ${location}…`}
                  aria-label="Nhập câu hỏi cho LocalMate AI"
                  disabled={mutation.isPending}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-base text-[#132119] outline-none transition placeholder:text-[#8a9890] focus:border-[#123d2a] focus:bg-white focus:ring-2 focus:ring-[#123d2a]/15 disabled:opacity-60 sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || mutation.isPending}
                  aria-label="Gửi câu hỏi"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123d2a] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4.5"
                >
                  <span className="hidden sm:inline">Gửi</span>
                  <VsIcon name="send" className="text-base" />
                </button>
              </form>
            </div>
          )}
          </section>
        </>
      ) : (
        <div className="flex flex-col items-end gap-3">
          {/* Speech-bubble teaser card */}
          <aside
            ref={teaserRef}
            aria-label="Gợi ý từ LocalMate AI"
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
            {/* Bubble tail pointing down-right toward the FAB */}
            <div className="absolute -bottom-[9px] right-6 h-[18px] w-[18px] rotate-45 border-b border-r border-[#d6c08b]/60 bg-[#fffdf8]" />
            <div className="mb-1.5 flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10b981]" />
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#916e15]">✨ LocalMate AI</span>
            </div>
            <p className="text-[13px] font-semibold leading-snug text-[#1b352e]">
              Hỏi về du lịch bản địa?
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#6b7d73]">
              Tư vấn theo nơi Quý khách đang ở
            </p>
          </aside>

          {/* Glowing round avatar FAB */}
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => openChat("button")}
            aria-label="Mở LocalMate AI tư vấn du lịch bản địa"
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
