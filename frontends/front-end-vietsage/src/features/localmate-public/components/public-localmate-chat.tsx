"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { publicLocalMateResource } from "../resource";
import type { PublicLocalMateSuggestion } from "../types";

type Message = { id: number; sender: "guest" | "localmate"; text: string };

const welcome: Message = {
  id: 0,
  sender: "localmate",
  text: "Dạ em là LocalMate AI. Quý khách đang ở đâu ạ? Vui lòng cho em biết quận, thành phố hoặc tỉnh để em dò đúng nguồn tri thức địa phương.",
};

const defaultSuggestions: PublicLocalMateSuggestion[] = [
  { label: "Trải nghiệm nổi bật", query: "Gợi ý trải nghiệm nổi bật gần đây" },
  { label: "Tour trong ngày", query: "Có tour nào phù hợp trong ngày?" },
  { label: "Hướng dẫn viên", query: "Tìm hướng dẫn viên LocalMate phù hợp" },
];

export function PublicLocalMateChat() {
  const mutation = useMutation(publicLocalMateResource.bind({}).mutations.chat.options());
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [suggestions, setSuggestions] = useState<PublicLocalMateSuggestion[]>([]);
  const [locationError, setLocationError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, location]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, messages, mutation.isPending]);

  const saveLocation = () => {
    const value = locationInput.trim();
    if (value.length < 2 || value.length > 120) {
      setLocationError("Vui lòng nhập địa điểm từ 2 đến 120 ký tự.");
      return;
    }
    setLocation(value);
    setLocationError("");
    setMessages((current) => [
      ...current,
      { id: nextId.current++, sender: "guest", text: value },
      {
        id: nextId.current++,
        sender: "localmate",
        text: `Dạ em đã ghi nhận Quý khách đang ở ${value}. Quý khách muốn khám phá điều gì ạ?`,
      },
    ]);
    setSuggestions(defaultSuggestions);
  };

  const send = async (suggested?: string) => {
    const message = (suggested ?? input).trim();
    if (!location || !message || mutation.isPending) return;

    setMessages((current) => [
      ...current,
      { id: nextId.current++, sender: "guest", text: message },
    ]);
    setInput("");
    setSuggestions([]);

    try {
      const result = await mutation.mutateAsync({
        input: {
          message,
          location,
          language: "vi",
          history: messages.slice(-8).map(({ sender, text }) => ({ role: sender, text })),
        },
      });
      setMessages((current) => [
        ...current,
        { id: nextId.current++, sender: "localmate", text: result.reply },
      ]);
      setSuggestions(result.suggestions);
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

  const changeLocation = () => {
    setLocation("");
    setLocationInput("");
    setLocationError("");
    setInput("");
    setSuggestions([]);
    setMessages([
      {
        ...welcome,
        id: nextId.current++,
        text: "Dạ Quý khách muốn em tư vấn cho khu vực nào ạ? Vui lòng nhập quận, thành phố hoặc tỉnh mới.",
      },
    ]);
  };

  return (
    <div className="fixed bottom-5 right-4 z-50 sm:bottom-7 sm:right-7">
      {isOpen ? (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Đóng LocalMate AI"
            className="fixed inset-0 -z-10 bg-black/35 backdrop-blur-[2px] sm:hidden"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="LocalMate AI tư vấn du lịch bản địa"
            className="flex h-[min(620px,calc(100dvh-40px))] w-[calc(100vw-32px)] max-w-[400px] flex-col overflow-hidden rounded-3xl border border-[#d6c08b]/55 bg-[#fffdf8] shadow-[0_24px_70px_rgba(18,61,42,0.24)]"
          >
          <header className="relative flex shrink-0 items-center justify-between bg-gradient-to-r from-[#123d2a] to-[#245942] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#f3c66b]/15 ring-1 ring-[#f3c66b]/65">
                <VsIcon name="explore" className="text-2xl text-[#f3c66b]" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] ring-1 ring-[#123d2a]" />
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-tight">LocalMate AI</h2>
                <p className="flex items-center gap-1.5 truncate text-[12.5px] text-white/80">
                  <span className="font-medium text-[#a7f3d0]">Trực tuyến</span>
                  <span className="text-white/40">•</span>
                  <span>{location || "Tri thức du lịch bản địa"}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {location && (
                <button
                  type="button"
                  onClick={changeLocation}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-[#f3c66b] transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3c66b]"
                >
                  Đổi vị trí
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Đóng LocalMate AI"
                className="flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3c66b]"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto bg-gradient-to-b from-[#f8f4ea] to-[#f2ecdf]/60 p-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === "guest" ? "justify-end" : "justify-start"}`}>
                {message.sender === "localmate" && (
                  <span className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10">
                    <VsIcon name="explore" className="text-sm text-[#2a6649]" />
                  </span>
                )}
                <p
                  className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed shadow-sm ${
                    message.sender === "guest"
                      ? "rounded-tr-sm bg-gradient-to-br from-[#123d2a] to-[#1e5038] text-white"
                      : "rounded-tl-sm border border-[#123d2a]/10 bg-white text-[#24342b]"
                  }`}
                >
                  {message.text}
                </p>
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex items-center gap-2">
                <span className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123d2a]/10">
                  <VsIcon name="explore" className="text-sm text-[#2a6649]" />
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
            <div ref={messagesEndRef} />
          </div>

          {!location ? (
            <form
              className="shrink-0 border-t border-[#123d2a]/10 bg-white p-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveLocation();
              }}
            >
              <label htmlFor="localmate-public-location" className="block text-sm font-semibold text-[#123d2a]">
                📍 Quý khách đang ở đâu?
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  ref={inputRef}
                  id="localmate-public-location"
                  value={locationInput}
                  onChange={(event) => setLocationInput(event.target.value)}
                  placeholder="Ví dụ: Hoàn Kiếm, Hà Nội"
                  autoComplete="address-level1"
                  aria-describedby={locationError ? "localmate-location-error" : undefined}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-base text-[#132119] outline-none transition focus:border-[#123d2a] focus:ring-2 focus:ring-[#123d2a]/15"
                />
                <button type="submit" className="min-h-11 rounded-xl bg-[#123d2a] px-4 text-base font-bold text-white transition hover:bg-[#184d35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f]">
                  Tiếp tục
                </button>
              </div>
              {locationError && <p id="localmate-location-error" className="mt-2 text-sm text-red-700">{locationError}</p>}
            </form>
          ) : (
            <div className="shrink-0 border-t border-[#123d2a]/10 bg-white">
              {suggestions.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-4 pt-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.query}
                      type="button"
                      onClick={() => void send(suggestion.query)}
                      className="min-h-11 shrink-0 rounded-full border border-[#b8872f]/35 bg-[#fff7df] px-4 text-sm font-semibold text-[#735c00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123d2a]"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2 p-4"
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
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#123d2a]/20 bg-[#f8f4ea] px-3 text-base text-[#132119] outline-none transition focus:border-[#123d2a] focus:ring-2 focus:ring-[#123d2a]/15 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || mutation.isPending}
                  aria-label="Gửi câu hỏi"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#123d2a] text-white transition hover:bg-[#184d35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <VsIcon name="send" className="text-lg" />
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
            aria-label="Gợi ý từ LocalMate AI"
            className="relative w-[196px] cursor-pointer rounded-2xl border border-[#d6c08b]/60 bg-[#fffdf8] px-4 py-3 shadow-[0_8px_24px_rgba(18,61,42,0.13)] transition-all hover:border-[#d6c08b] hover:shadow-[0_10px_28px_rgba(18,61,42,0.18)]"
            onClick={() => setIsOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsOpen(true); }}
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
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="Mở LocalMate AI tư vấn du lịch bản địa"
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#123d2a] via-[#1a5038] to-[#2a6649] shadow-[0_8px_28px_rgba(18,61,42,0.38)] ring-2 ring-[#f3c66b]/80 transition-all duration-300 hover:scale-110 hover:shadow-[0_12px_36px_rgba(18,61,42,0.50)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] motion-reduce:transform-none cursor-pointer"
          >
            <span className="absolute inset-[-4px] animate-ping rounded-full bg-[#f3c66b]/20 motion-reduce:animate-none" />
            <VsIcon name="explore" className="relative text-[26px] text-[#f3c66b]" />
          </button>
        </div>
      )}
    </div>
  );
}
