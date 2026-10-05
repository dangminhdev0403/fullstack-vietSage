"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { publicLocalMateResource } from "../resource";
import { publicLocalMateRepository } from "../repository";
import type {
  PublicBookingCandidate,
  PublicConversationMessage,
  PublicLocalMateSuggestion,
  PublicOrder,
} from "../types";
import {
  type DestinationRegion,
  POPULAR_DESTINATIONS,
  REGION_TABS,
  VIETNAM_PROVINCES,
} from "../constants/locations";

type Message = {
  id: number;
  sender: "guest" | "localmate";
  text: string;
  candidateKey?: string;
};

type ViewMode = "discovery" | "confirm" | "payment" | "guide-chat";

const welcome: Message = {
  id: 0,
  sender: "localmate",
  text: "Dạ em là LocalMate AI — trợ lý du lịch bản địa của VietSage. Quý khách đang dừng chân hoặc dự định khám phá khu vực nào ạ?",
};

const initialDiscoveryQuery = "Gợi ý các địa danh và trải nghiệm nổi bật gần đây";

function createIdempotencyKey(): string {
  return `ord_${crypto.randomUUID()}`;
}

function createBookingFingerprint(
  candidateKey: string,
  location: string,
  guestDisplayName: string,
  guestPhone: string,
): string {
  return JSON.stringify([candidateKey, location, guestDisplayName, guestPhone]);
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
    <div className="space-y-1.5 break-words">
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

export function PublicLocalMateChat() {
  const chatMutation = useMutation(publicLocalMateResource.bind({}).mutations.chat.options());
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("discovery");
  const [location, setLocation] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [suggestions, setSuggestions] = useState<PublicLocalMateSuggestion[]>([]);
  const [locationError, setLocationError] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<DestinationRegion>("all");

  // Booking & Confirmation state
  const [activeCandidateKey, setActiveCandidateKey] = useState<string | null>(null);
  const [candidateDetails, setCandidateDetails] = useState<PublicBookingCandidate | null>(null);
  const [isLoadingCandidate, setIsLoadingCandidate] = useState(false);
  const [bookingPreviewFingerprint, setBookingPreviewFingerprint] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [requestedStartAt, setRequestedStartAt] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Payment state
  const [currentOrder, setCurrentOrder] = useState<PublicOrder | null>(null);
  const [paymentCheckoutUrl, setPaymentCheckoutUrl] = useState<string | null>(null);
  const isPollingPayment = viewMode === "payment" && Boolean(currentOrder?.id);

  // Guide Chat state
  const [conversationMessages, setConversationMessages] = useState<PublicConversationMessage[]>([]);
  const [guideInput, setGuideInput] = useState("");
  const [isSendingGuideMessage, setIsSendingGuideMessage] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const teaserRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const openerKindRef = useRef<"teaser" | "button">("button");
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
      )
    : "";
  const isCandidatePreviewCurrent =
    Boolean(candidateDetails) && bookingPreviewFingerprint === currentBookingFingerprint;

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
    if (isOpen && viewMode === "discovery") {
      inputRef.current?.focus();
    }
  }, [isOpen, viewMode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        window.setTimeout(
          () =>
            (openerKindRef.current === "teaser"
              ? teaserRef.current
              : openButtonRef.current
            )?.focus(),
          50,
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

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

  // Payment polling effect: poll every 2500ms while on payment screen
  useEffect(() => {
    if (viewMode !== "payment" || !currentOrder?.id) return;

    let isMounted = true;

    const pollInterval = setInterval(async () => {
      try {
        const updated = await publicLocalMateRepository.getOrder(currentOrder.id);
        if (!isMounted) return;

        setCurrentOrder(updated);

        const status = updated.payment?.status;
        if (status === "PAID" || status === "NOT_REQUIRED") {
          clearInterval(pollInterval);
          setViewMode("guide-chat");
        }
      } catch {
        // Ignored in poll interval
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [viewMode, currentOrder?.id]);

  // Guide Chat polling effect: poll conversation messages every 3000ms
  useEffect(() => {
    if (viewMode !== "guide-chat" || !currentOrder?.id) return;

    let isMounted = true;

    const fetchMessages = async () => {
      try {
        const conv = await publicLocalMateRepository.getConversation(currentOrder.id);
        if (isMounted && conv?.items) {
          setConversationMessages(conv.items);
        }
      } catch {
        // Ignored
      }
    };

    void fetchMessages();
    const interval = setInterval(fetchMessages, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [viewMode, currentOrder?.id]);

  const send = async (explicitText?: string, explicitLocation?: string, displayTextOverride?: string) => {
    const rawText = (explicitText ?? input).trim();
    if (!rawText || chatMutation.isPending) return;

    const activeLocation = explicitLocation ?? location;
    const displayText = displayTextOverride ?? rawText;

    const userMessage: Message = { id: nextId.current++, sender: "guest", text: displayText };
    setMessages((current) => [...current, userMessage]);
    if (!explicitText) setInput("");

    try {
      const sanitizedHistory = messages
        .filter((m) => m.id !== 0)
        .slice(-6)
        .map((m) => ({
          role: m.sender,
          text: m.text,
        }));

      const result = await chatMutation.mutateAsync({
        input: {
          message: rawText,
          location: activeLocation || undefined,
          language: "vi",
          history: sanitizedHistory,
        },
      });

      const candidateKey = result.action?.candidateKey;

      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          sender: "localmate",
          text: result.reply,
          candidateKey,
        },
      ]);
      setSuggestions(result.suggestions);

      if (candidateKey) {
        setActiveCandidateKey(candidateKey);
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

  const handleStartBooking = (key: string) => {
    setActiveCandidateKey(key);
    setCandidateDetails(null);
    setBookingPreviewFingerprint("");
    setCurrentOrder(null);
    setPaymentCheckoutUrl(null);
    setIdempotencyKey(createIdempotencyKey());
    setBookingError("");
    setViewMode("confirm");
  };

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidateKey) return;

    const name = guestDisplayName.trim();
    const phone = guestPhone.trim();
    if (!name || name.length < 2) {
      setBookingError("Vui lòng nhập họ và tên của Quý khách (tối thiểu 2 ký tự)");
      return;
    }
    if (!phone || !/^\+?[0-9][0-9 .()-]{5,30}$/.test(phone)) {
      setBookingError("Vui lòng nhập số điện thoại hợp lệ để hướng dẫn viên liên hệ");
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
      );
      if (!candidateDetails || bookingPreviewFingerprint !== fingerprint) {
        setIsLoadingCandidate(true);
        setCurrentOrder(null);
        await publicLocalMateRepository.createSession({
          location: location || "Toàn quốc",
          guestDisplayName: name,
          guestPhone: phone,
        });
        const candidate = await publicLocalMateRepository.getCandidate(activeCandidateKey);
        setCandidateDetails(candidate);
        setBookingPreviewFingerprint(fingerprint);
        setIdempotencyKey(createIdempotencyKey());
        return;
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
          quantity: partySize,
          partySize,
          requestedStartAt: requestedStartAt ? new Date(requestedStartAt).toISOString() : null,
          guestNote: guestNote.trim() || null,
          idempotencyKey: key,
        }));

      if (!currentOrder) setCurrentOrder(order);

      const paymentRes = await publicLocalMateRepository.createPaymentSession(order.id);
      const payment = paymentRes.payment;

      if (payment?.status === "PAID" || payment?.status === "NOT_REQUIRED") {
        setViewMode("guide-chat");
      } else {
        setPaymentCheckoutUrl(payment?.checkoutUrl ?? null);
        setViewMode("payment");
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string } | null | undefined;
      setBookingError(errorObj?.message || "Không thể khởi tạo đơn hàng. Vui lòng thử lại.");
    } finally {
      setIsLoadingCandidate(false);
      setIsSubmittingOrder(false);
    }
  };

  const handleSendGuideMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = guideInput.trim();
    if (!body || !currentOrder?.id || isSendingGuideMessage) return;

    setIsSendingGuideMessage(true);
    setGuideInput("");

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: PublicConversationMessage = {
      id: optimisticId,
      orderId: currentOrder.id,
      senderType: "GUEST",
      body,
      deliveryStatus: "PENDING",
      createdAt: new Date().toISOString(),
    };
    setConversationMessages((prev) => [...prev, optimisticMessage]);

    try {
      const created = await publicLocalMateRepository.sendMessage(currentOrder.id, {
        body,
        clientMessageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      });

      setConversationMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? created : m)),
      );
    } catch {
      // Revert optimistic or mark error
    } finally {
      setIsSendingGuideMessage(false);
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
      50,
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
                    aria-label="Quay lại khám phá"
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
                    {viewMode === "discovery" && "LocalMate AI"}
                    {viewMode === "confirm" && "Xác nhận đặt tour"}
                    {viewMode === "payment" && "Thanh toán Stripe"}
                    {viewMode === "guide-chat" && (candidateDetails?.guide.fullName || "Hướng dẫn viên")}
                  </h2>
                  <p className="flex items-center gap-1.5 truncate text-[11.5px] text-white/80 sm:text-[12.5px]">
                    {viewMode === "discovery" && (
                      <>
                        <span className="font-medium text-[#a7f3d0]">Trực tuyến</span>
                        <span className="text-white/40">•</span>
                        <span className="truncate">{location || "Tri thức du lịch bản địa"}</span>
                      </>
                    )}
                    {viewMode === "confirm" && (
                      <span className="truncate text-[#f3c66b] font-medium">
                        {location || "Tư vấn bản địa"}
                      </span>
                    )}
                    {viewMode === "payment" && currentOrder && (
                      <span className="truncate font-mono text-white/90">
                        Đơn #{currentOrder.orderNumber}
                      </span>
                    )}
                    {viewMode === "guide-chat" && currentOrder && (
                      <span className="truncate font-medium text-[#a7f3d0]">
                        Đang kết nối • #{currentOrder.orderNumber}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {viewMode === "discovery" && location && (
                  <button
                    type="button"
                    disabled={chatMutation.isPending}
                    onClick={changeLocation}
                    className="min-h-9 rounded-full px-2.5 text-xs font-semibold text-[#f3c66b] transition hover:bg-white/10 disabled:opacity-50 sm:min-h-10 sm:px-3 sm:text-sm"
                  >
                    Đổi vị trí
                  </button>
                )}
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeChat}
                  aria-label="Đóng LocalMate AI"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 sm:h-10 sm:w-10"
                >
                  <VsIcon name="close" className="text-xl" />
                </button>
              </div>
            </header>

            {/* VIEW 1: DISCOVERY AI CHAT */}
            {viewMode === "discovery" && (
              <>
                <div
                  ref={messagesContainerRef}
                  className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#f8f4ea] to-[#f2ecdf]/60 p-3.5 sm:p-4"
                  aria-live="polite"
                >
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex flex-col ${message.sender === "guest" ? "items-end" : "items-start"}`}
                    >
                      <div className={`flex ${message.sender === "guest" ? "justify-end" : "justify-start"}`}>
                        {message.sender === "localmate" && (
                          <span className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10">
                            <VsIcon name="sparkles" className="text-sm text-[#2a6649]" />
                          </span>
                        )}
                        <div
                          className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-sm sm:text-[14.5px] ${
                            message.sender === "guest"
                              ? "rounded-tr-sm bg-gradient-to-br from-[#123d2a] to-[#1e5038] text-white"
                              : "rounded-tl-sm border border-[#123d2a]/10 bg-white text-[#24342b]"
                          }`}
                        >
                          {renderMessageContent(message.text, message.sender === "guest")}
                        </div>
                      </div>

                      {/* Interactive Booking CTA inside chat message when tour is matched */}
                      {message.candidateKey && (
                        <div className="ml-9 mt-2.5 max-w-[88%] rounded-2xl border border-[#b8872f]/45 bg-[#fff9ed] p-3.5 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#123d2a]">
                            <VsIcon name="hotel_class" className="text-base text-[#b8872f]" />
                            <span>Trải nghiệm phù hợp được tìm thấy!</span>
                          </div>
                          <p className="mt-1 text-xs text-[#526458] leading-relaxed">
                            Quý khách có thể xác nhận đặt tour và mở kênh trao đổi trực tiếp với Hướng dẫn viên bản địa ngay tại đây.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleStartBooking(message.candidateKey!)}
                            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 focus-visible:outline-2 focus-visible:outline-[#b8872f]"
                          >
                            <span>Xác nhận thông tin & Đặt tour</span>
                            <VsIcon name="arrow_forward" className="text-sm" />
                          </button>
                        </div>
                      )}
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

                      <div
                        className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none"
                        role="tablist"
                        aria-label="Lọc theo miền"
                      >
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

                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {displayedDestinations.map((dest) => (
                          <button
                            key={dest.name}
                            type="button"
                            onClick={() => saveLocation(dest.name)}
                            className="group flex flex-col items-start rounded-xl border border-[#123d2a]/10 bg-[#fffdf8] p-2 text-left transition hover:border-[#b8872f] hover:bg-[#fff9ed] active:scale-95"
                          >
                            <span className="text-xs font-bold text-[#123d2a] group-hover:text-[#916e15]">
                              {dest.name}
                            </span>
                            <span className="text-[10px] text-[#627064] line-clamp-1">{dest.tag}</span>
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
                          LocalMate đang tra cứu...
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
                          disabled={!locationInput.trim()}
                          aria-label="Gửi địa điểm hoặc câu hỏi"
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4.5"
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
                        placeholder={`Hỏi về ${location}…`}
                        aria-label="Nhập câu hỏi cho LocalMate AI"
                        disabled={chatMutation.isPending}
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-base text-[#132119] outline-none transition placeholder:text-[#8a9890] focus:border-[#123d2a] focus:bg-white focus:ring-2 focus:ring-[#123d2a]/15 disabled:opacity-60 sm:text-sm"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || chatMutation.isPending}
                        aria-label="Gửi câu hỏi"
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4.5"
                      >
                        <span className="hidden sm:inline">Gửi</span>
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
                      Đang lấy thông tin tour...
                    </span>
                  </div>
                ) : (
                  <form onSubmit={handleConfirmOrder} className="space-y-4">
                    {/* Candidate Preview Card */}
                    <div className="rounded-2xl border border-[#d6c08b]/50 bg-[#fff9ed] p-3.5 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#916e15]">
                            Trải nghiệm bản địa
                          </span>
                          <h3 className="mt-0.5 text-sm font-bold text-[#123d2a]">
                            {isCandidatePreviewCurrent
                              ? candidateDetails?.service.name
                              : "Dịch vụ LocalMate đồng hành"}
                          </h3>
                        </div>
                        <span className="rounded-full bg-[#123d2a] px-2.5 py-1 text-xs font-bold text-[#f3c66b]">
                          {isCandidatePreviewCurrent && candidateDetails?.service.price
                            ? `${Number(candidateDetails.service.price).toLocaleString("vi-VN")} VND`
                            : "Giá niêm yết"}
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
                          Họ và tên của Quý khách <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          disabled={Boolean(currentOrder)}
                          value={guestDisplayName}
                          onChange={(e) => setGuestDisplayName(e.target.value)}
                          placeholder="Ví dụ: Nguyễn Văn A"
                          className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#123d2a] mb-1">
                          Số điện thoại liên hệ <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          disabled={Boolean(currentOrder)}
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="Ví dụ: 0901234567"
                          className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold text-[#123d2a] mb-1">
                            Số lượng khách
                          </label>
                          <select
                            value={partySize}
                            disabled={Boolean(currentOrder)}
                            onChange={(e) => setPartySize(Number(e.target.value))}
                            className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                          >
                            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                              <option key={n} value={n}>
                                {n} khách
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#123d2a] mb-1">
                            Thời gian hẹn
                          </label>
                          <input
                            type="datetime-local"
                            value={requestedStartAt}
                            disabled={Boolean(currentOrder)}
                            onChange={(e) => setRequestedStartAt(e.target.value)}
                            className="min-h-11 w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-2.5 text-xs text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#123d2a] mb-1">
                          Ghi chú cho Hướng dẫn viên
                        </label>
                        <textarea
                          rows={2}
                          value={guestNote}
                          disabled={Boolean(currentOrder)}
                          onChange={(e) => setGuestNote(e.target.value)}
                          placeholder="Yêu cầu đặc biệt, sở thích ẩm thực..."
                          className="w-full rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] p-2.5 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                        />
                      </div>
                    </div>

                    {bookingError && (
                      <p className="text-xs font-semibold text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200">
                        {bookingError}
                      </p>
                    )}

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmittingOrder}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#184d35] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSubmittingOrder ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Đang tạo đơn...</span>
                          </>
                        ) : (
                          <>
                            <span>
                              {currentOrder
                                ? "Thử lại thanh toán"
                                : isCandidatePreviewCurrent
                                  ? "Xác nhận & Đi đến thanh toán"
                                  : "Kiểm tra thông tin"}
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
                      <span>Mã đơn: <b>#{currentOrder.orderNumber}</b></span>
                      <span className="font-semibold text-[#123d2a]">{currentOrder.quantity} khách</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-[#123d2a]">
                      {currentOrder.serviceNameSnapshot}
                    </h3>
                    <div className="mt-2.5 flex items-baseline justify-between border-t border-[#d6c08b]/30 pt-2 text-sm font-bold text-[#123d2a]">
                      <span>Tổng chi phí:</span>
                      <span className="text-base text-[#123d2a]">
                        {Number(currentOrder.customerTotalAmount || currentOrder.totalAmount).toLocaleString("vi-VN")} VND
                      </span>
                    </div>
                  </div>

                  {paymentCheckoutUrl ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#123d2a]/10 bg-white p-4 shadow-sm">
                      <div className="p-2 bg-white rounded-xl shadow-inner border border-black/5">
                        <QRCodeSVG value={paymentCheckoutUrl} size={170} level="M" />
                      </div>
                      <p className="mt-2.5 text-xs font-semibold text-[#123d2a]">
                        Quét mã QR bằng điện thoại để thanh toán Stripe
                      </p>
                      <a
                        href={paymentCheckoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#123d2a] bg-[#f8f4ea] px-4 text-xs font-bold text-[#123d2a] transition hover:bg-[#123d2a] hover:text-white"
                      >
                        <span>Mở liên kết thanh toán</span>
                        <VsIcon name="open_in_new" className="text-sm" />
                      </a>
                    </div>
                  ) : (
                    <div className="py-8">
                      <span className="text-xs text-[#526458]">Đang khởi tạo cổng thanh toán...</span>
                    </div>
                  )}

                  {isPollingPayment && (
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-[#2a6649]">
                      <span className="h-2 w-2 animate-ping rounded-full bg-[#10b981]" />
                      <span>Đang chờ xác nhận thanh toán tự động...</span>
                    </div>
                  )}
                </div>

                <div className="w-full pt-3">
                  <button
                    type="button"
                    onClick={() => setViewMode("discovery")}
                    className="text-xs font-semibold text-[#526458] hover:text-[#123d2a] underline"
                  >
                    Quay lại khám phá
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 4: DIRECT PAID GUIDE CHAT */}
            {viewMode === "guide-chat" && (
              <div className="flex flex-1 flex-col overflow-hidden bg-[#fffdf8]">
                <div className="flex-1 space-y-3 overflow-y-auto p-3.5 bg-gradient-to-b from-[#f8f4ea] to-[#f2ecdf]/50">
                  <div className="rounded-xl border border-[#10b981]/30 bg-[#ecfdf5] p-2.5 text-center text-xs font-semibold text-[#065f46]">
                    ✓ Đã hoàn tất thanh toán. Quý khách đang kết nối trực tiếp với Hướng dẫn viên bản địa!
                  </div>

                  {conversationMessages.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#526458]">
                      Chưa có tin nhắn. Quý khách hãy gửi lời chào hoặc địa điểm đón tiếp tại đây ạ.
                    </div>
                  ) : (
                    conversationMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderType === "GUEST" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.senderType !== "GUEST" && (
                          <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/15 text-[11px] font-bold text-[#123d2a]">
                            HDV
                          </span>
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                            msg.senderType === "GUEST"
                              ? "rounded-tr-sm bg-[#123d2a] text-white"
                              : "rounded-tl-sm border border-[#123d2a]/10 bg-white text-[#24342b]"
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={guideChatEndRef} />
                </div>

                {/* Guide Message Input Bar */}
                <form
                  onSubmit={handleSendGuideMessage}
                  className="flex gap-2 border-t border-[#123d2a]/10 bg-white p-3"
                >
                  <input
                    type="text"
                    value={guideInput}
                    onChange={(e) => setGuideInput(e.target.value)}
                    placeholder="Nhắn tin cho hướng dẫn viên..."
                    disabled={isSendingGuideMessage}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3.5 text-sm text-[#132119] outline-none focus:border-[#123d2a] focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={!guideInput.trim() || isSendingGuideMessage}
                    aria-label="Gửi tin nhắn"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#184d35] active:scale-95 disabled:opacity-40"
                  >
                    <span>Gửi</span>
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
