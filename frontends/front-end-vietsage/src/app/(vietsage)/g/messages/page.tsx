"use client";

import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";

import { playMessageAlertSound } from "@/features/request-realtime/audio-notifier";
import type { GuestMessagesResult } from "@/features/guest-os/types/guest-os-contract";

function TypewriterMessageBody({ body, createdAt }: Readonly<{ body: string; createdAt: string }>) {
  const [displayedText, setDisplayedText] = useState(() => {
    if (typeof window === "undefined") return body;
    const msgTime = new Date(createdAt).getTime();
    const isNew = !Number.isNaN(msgTime) && Math.abs(Date.now() - msgTime) < 15000;
    return isNew ? "" : body;
  });
  const [isTyping, setIsTyping] = useState(() => {
    if (typeof window === "undefined") return false;
    const msgTime = new Date(createdAt).getTime();
    return !Number.isNaN(msgTime) && Math.abs(Date.now() - msgTime) < 15000;
  });

  useEffect(() => {
    const msgTime = new Date(createdAt).getTime();
    const isNew = !Number.isNaN(msgTime) && Math.abs(Date.now() - msgTime) < 15000;

    if (!isNew) return;

    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex += 1;
      setDisplayedText(body.slice(0, currentIndex));
      if (currentIndex >= body.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [body, createdAt]);

  return (
    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-left">
      {displayedText}
      {isTyping && (
        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse rounded-sm align-middle opacity-80" />
      )}
    </p>
  );
}

export default function GuestMessagesPage() {
  const { locale } = useGuestI18n();
  const hydrated = useGuestStoreHydrated();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const room = useGuestStore((state) => state.room);
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isPrependingRef = useRef<boolean>(false);
  const prevMessageCountRef = useRef<number>(0);
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false);

  const lastSentAtRef = useRef<number>(0);
  const lastTypingEmitRef = useRef<number>(0);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const peerTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevLatestMsgIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const messagesQuery = useInfiniteQuery<GuestMessagesResult, Error, InfiniteData<GuestMessagesResult>, (string | null)[], string | undefined>({
    queryKey: ["guest-messages", sessionToken],
    queryFn: ({ pageParam }) =>
      guestOsService.listMessages(sessionToken!, { before: pageParam, limit: 20 }, locale),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    enabled: hydrated && Boolean(sessionToken),
    refetchInterval: 3000,
  });

  const pages = messagesQuery.data?.pages ?? [];
  const items = pages
    .slice()
    .reverse()
    .flatMap((page) => page.items)
    .reduce<Array<(typeof pages)[number]["items"][number]>>((acc, item) => {
      if (!acc.some((m) => m.id === item.id)) {
        acc.push(item);
      }
      return acc;
    }, []);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (container.scrollTop < 80 && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      prevScrollHeightRef.current = container.scrollHeight;
      isPrependingRef.current = true;
      messagesQuery.fetchNextPage().catch(() => {});
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      setShowNewMessageBadge(false);
    }
  };

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isPrependingRef.current) {
      isPrependingRef.current = false;
      const scrollDelta = container.scrollHeight - prevScrollHeightRef.current;
      container.scrollTop = container.scrollTop + scrollDelta;
    }
  }, [items.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (prevMessageCountRef.current === 0 && items.length > 0) {
      container.scrollTop = container.scrollHeight;
      prevMessageCountRef.current = items.length;
      return;
    }

    if (items.length > prevMessageCountRef.current) {
      prevMessageCountRef.current = items.length;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        setShowNewMessageBadge(false);
      } else {
        setShowNewMessageBadge(true);
      }
    }
  }, [items]);

  // Play alert sound when guest receives a new message from staff
  useEffect(() => {
    if (items.length > 0) {
      const latestMsg = items[items.length - 1];
      if (
        prevLatestMsgIdRef.current &&
        prevLatestMsgIdRef.current !== latestMsg.id &&
        latestMsg.senderType === "STAFF"
      ) {
        playMessageAlertSound();
      }
      prevLatestMsgIdRef.current = latestMsg.id;
    }
  }, [items]);

  const send = useMutation({
    mutationFn: () => guestOsService.sendMessage(sessionToken!, body.trim(), locale),
    onSuccess: (res) => {
      setBody("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      if (res?.message) {
        queryClient.setQueryData<{ pages: GuestMessagesResult[]; pageParams: unknown[] }>(
          ["guest-messages", sessionToken],
          (oldData) => {
            if (!oldData?.pages?.length) return oldData;
            const newPages = [...oldData.pages];
            const firstPage = { ...newPages[0] };
            if (!firstPage.items.some((message) => message.id === res.message.id)) {
              firstPage.items = [...firstPage.items, res.message];
            }
            newPages[0] = firstPage;
            return { ...oldData, pages: newPages };
          },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["guest-messages", sessionToken] }).catch(() => {});
    },
  });

  // Listen for staff typing signals across windows/tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSignal = (detail?: { role?: string }) => {
      if (detail?.role === "STAFF") {
        setIsPeerTyping(true);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => {
          setIsPeerTyping(false);
        }, 3500);
      }
    };

    const handleLocal = (e: Event) => {
      const customEvent = e as CustomEvent<{ role?: string }>;
      handleSignal(customEvent.detail);
    };

    window.addEventListener("vietsage:typing-signal", handleLocal);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel("vietsage_typing_channel");
        channel.onmessage = (event) => handleSignal(event.data);
      } catch {}
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "vietsage_typing_signal" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          handleSignal(data);
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("vietsage:typing-signal", handleLocal);
      if (channel) {
        channel.close();
      }
      window.removeEventListener("storage", handleStorage);
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
    };
  }, []);

  const emitTypingSignal = () => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 1500) {
      lastTypingEmitRef.current = now;
      if (typeof window !== "undefined") {
        const payload = { role: "GUEST", timestamp: now };
        window.dispatchEvent(new CustomEvent("vietsage:typing-signal", { detail: payload }));
        if ("BroadcastChannel" in window) {
          try {
            const bc = new BroadcastChannel("vietsage_typing_channel");
            bc.postMessage(payload);
            bc.close();
          } catch {}
        }
        try {
          localStorage.setItem("vietsage_typing_signal", JSON.stringify(payload));
        } catch {}
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    emitTypingSignal();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(44, Math.min(textareaRef.current.scrollHeight, 160))}px`;
    }
  };

  const executeSend = () => {
    const now = Date.now();
    if (now - lastSentAtRef.current < 600) return; // 600ms send cooldown debounce
    if (body.trim() && body.length <= 1000 && !send.isPending) {
      lastSentAtRef.current = now;
      send.mutate();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeSend();
    }
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    executeSend();
  }

  if (!hydrated || !sessionToken) {
    return <GuestAccessRequiredState icon={<VsIcon name="qr_code_scanner" className="text-3xl" />} />;
  }

  const roomLabel = room?.roomNumber ? `Phòng ${room.roomNumber}` : "Lễ tân";

  return (
    <div className="vs-page-shell vs-safe-bottom flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#f8f4ea] text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="vs-container mx-auto flex flex-1 min-h-0 w-full max-w-3xl flex-col justify-center my-auto px-2 pt-16 sm:px-4 sm:pt-18">
        <section className="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-[#25483f]/15 bg-[#fffdfa] shadow-[0_18px_46px_rgba(31,61,53,0.08)]">
          <header className="shrink-0 flex items-center justify-between border-b border-[#25483f]/10 bg-[#fbf8f1] px-5 py-3.5">
            <div>
              <p className="text-sm font-bold text-[#8a6a13] tracking-wide">{roomLabel}</p>
              <h1 className="vs-display text-2xl sm:text-3xl font-extrabold text-[#25483f] leading-tight">Nhắn lễ tân</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-[#25483f]/10 px-3.5 py-1.5 text-xs font-bold text-[#25483f]">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Hỗ trợ 24/7
            </div>
          </header>
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 md:p-6"
          >
            {messagesQuery.isFetchingNextPage && (
              <div className="flex justify-center py-2 transition-all">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#25483f]/15 bg-[#fbf8f1]/90 px-4 py-1.5 text-xs font-bold text-[#25483f] shadow-md backdrop-blur-md">
                  <VsIcon name="progress_activity" className="animate-spin text-sm text-[#8a6a13]" />
                  <span>Đang tải tin nhắn cũ hơn...</span>
                </div>
              </div>
            )}

            {messagesQuery.isLoading && (
              <div className="space-y-4 py-4 animate-pulse">
                <div className="flex justify-start">
                  <div className="space-y-1.5 max-w-[65%]">
                    <div className="h-3.5 w-20 rounded bg-black/10" />
                    <div className="h-12 w-56 rounded-2xl rounded-tl-none bg-[#f1ead9]" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="space-y-1.5 max-w-[65%] items-end flex flex-col">
                    <div className="h-3.5 w-14 rounded bg-black/10" />
                    <div className="h-10 w-44 rounded-2xl rounded-tr-none bg-[#25483f]/25" />
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="space-y-1.5 max-w-[65%]">
                    <div className="h-3.5 w-24 rounded bg-black/10" />
                    <div className="h-14 w-64 rounded-2xl rounded-tl-none bg-[#f1ead9]" />
                  </div>
                </div>
              </div>
            )}

            {messagesQuery.isError ? <p className="text-base text-red-700">Không thể tải hội thoại. Vui lòng thử lại.</p> : null}
            {!messagesQuery.isLoading && items.length === 0 ? (
              <div className="py-16 text-center text-base text-[#66736b]">
                <VsIcon name="chat" className="mx-auto mb-3 text-4xl text-[#8a6a13]" />
                Gửi tin nhắn khi cần hỗ trợ từ lễ tân.
              </div>
            ) : null}

            {items.map((message) => {
              const fromGuest = message.senderType === "GUEST";
              return (
                <div key={message.id} className={`flex ${fromGuest ? "justify-end" : "justify-start"}`}>
                  <div className={`min-w-0 max-w-[82%] sm:max-w-[75%] flex flex-col ${fromGuest ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 px-1 mb-1">
                      <span className="text-xs font-bold text-[#25483f]">{fromGuest ? "Bạn" : (message.senderName ?? "Lễ tân")}</span>
                      <span className="text-xs text-[#66736b]">{new Date(message.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className={`w-fit max-w-full rounded-2xl px-4 py-3 text-base leading-relaxed shadow-sm ${fromGuest ? "bg-[#25483f] text-white rounded-tr-none" : "bg-[#f1ead9] text-[#18211d] rounded-tl-none"}`}>
                      <TypewriterMessageBody body={message.body} createdAt={message.createdAt} />
                    </div>
                  </div>
                </div>
              );
            })}

            {send.isPending && (
              <div className="flex justify-end my-1.5 opacity-80 animate-pulse">
                <div className="flex items-center gap-2 rounded-2xl rounded-tr-none bg-[#25483f] px-4 py-3 text-white text-base shadow-sm">
                  <span>Đang gửi...</span>
                  <VsIcon name="progress_activity" className="animate-spin text-base" />
                </div>
              </div>
            )}

            {isPeerTyping && (
              <div className="flex justify-start my-2 transition-all">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-none bg-[#f1ead9] border border-[#25483f]/10 px-4 py-2.5 text-xs text-[#18211d] shadow-sm">
                  <span className="font-bold text-[#25483f]">Lễ tân đang soạn tin nhắn</span>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#25483f] animate-bounce [animation-delay:-0.32s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#25483f] animate-bounce [animation-delay:-0.16s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#25483f] animate-bounce" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Floating "Tin nhắn mới" Badge for Guest Chat */}
          {showNewMessageBadge && (
            <button
              type="button"
              onClick={() => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" });
                  setShowNewMessageBadge(false);
                }
              }}
              className="absolute bottom-20 right-6 z-10 flex items-center gap-1.5 rounded-full bg-[#25483f] px-4 py-2 text-xs font-bold text-white shadow-xl transition hover:scale-105 active:scale-95"
            >
              <VsIcon name="arrow_downward" className="text-sm animate-bounce" />
              Tin nhắn mới
            </button>
          )}

          <form onSubmit={submit} className="flex items-end gap-2 border-t border-[#25483f]/10 bg-[#fffdfa] p-3 sm:p-4">
            <label className="sr-only" htmlFor="guest-message">Tin nhắn</label>
            <div className="min-w-0 flex-1">
              <textarea
                id="guest-message"
                ref={textareaRef}
                rows={1}
                value={body}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                aria-describedby="guest-message-limit"
                aria-invalid={body.length > 1000}
                placeholder="Nhập tin nhắn cho lễ tân (Enter để gửi)..."
                className="min-h-12 max-h-36 w-full resize-none overflow-y-auto rounded-xl border border-[#25483f]/20 bg-white px-4 py-3 text-base text-[#18211d] placeholder:text-[#8b9890] outline-none transition focus:border-[#25483f] focus:ring-1 focus:ring-[#25483f]"
              />
              <p
                id="guest-message-limit"
                className={`mt-1.5 text-right text-xs ${body.length > 1000 ? "font-semibold text-red-700" : "text-[#66736b]"}`}
              >
                Tin nhắn dài tối đa 1000 ký tự. {body.length}/1000
              </p>
            </div>
            <button
              type="submit"
              disabled={!body.trim() || body.length > 1000 || send.isPending}
              className="vs-touch-button inline-flex min-h-12 items-center justify-center rounded-xl bg-[#25483f] px-4 text-white disabled:opacity-50 shrink-0"
              aria-label="Gửi tin nhắn"
            >
              <VsIcon name="send" className="text-xl" />
            </button>
          </form>
        </section>
      </main>
      <VsBottomNav active="messages" />
    </div>
  );
}
