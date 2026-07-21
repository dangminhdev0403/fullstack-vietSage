"use client";

import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import Swal from "sweetalert2";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { requestInternalApi } from "@/core/http/internal-api-client";
import { playMessageAlertSound } from "@/features/request-realtime/audio-notifier";

type Message = {
  id: string;
  senderType: "GUEST" | "STAFF" | "SYSTEM";
  senderName: string | null;
  body: string;
  createdAt: string;
};

type Thread = {
  id: string;
  status: string;
  roomNumber: string;
  guestName: string;
  lastMessageAt: string;
  latestMessage: Message | null;
};

type ThreadList = { items: Thread[]; total: number };
type ThreadPage = {
  thread: Thread;
  items: Message[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

function formatMessageTime(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

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

export function RoomMessagesClient({ hotelId, canReply }: Readonly<{ hotelId: string; canReply: boolean }>) {
  const base = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/messages`;
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftsByThread, setDraftsByThread] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false);

  const body = selectedId ? (draftsByThread[selectedId] ?? "") : "";

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isPrependingRef = useRef<boolean>(false);
  const prevMessageCountRef = useRef<number>(0);

  const prevLatestMessageIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastTypingEmitRef = useRef<number>(0);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const peerTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectThread = (id: string | null) => {
    if (id !== selectedId) {
      setSelectedId(id);
      setShowNewMessageBadge(false);
      prevMessageCountRef.current = 0;
    }
  };

  const threads = useQuery({
    queryKey: ["hotel-message-threads", hotelId],
    queryFn: () => requestInternalApi<ThreadList>(base, { method: "GET" }),
    refetchInterval: 5000,
  });

  const detail = useInfiniteQuery<ThreadPage, Error, InfiniteData<ThreadPage>, (string | null)[], string | undefined>({
    queryKey: ["hotel-message-thread", hotelId, selectedId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (pageParam) params.set("before", pageParam);
      return requestInternalApi<ThreadPage>(`${base}/${encodeURIComponent(selectedId!)}?${params.toString()}`, {
        method: "GET",
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    enabled: Boolean(selectedId),
    refetchInterval: 4000,
  });

  // Flatten messages from pages in chronological order (oldest page first, newest page last)
  const pages = detail.data?.pages ?? [];
  const activeThread = pages[0]?.thread;
  const messages = pages
    .slice()
    .reverse()
    .flatMap((page) => page.items)
    .reduce<Message[]>((acc, item) => {
      if (!acc.some((m) => m.id === item.id)) {
        acc.push(item);
      }
      return acc;
    }, []);

  // Handle Reverse Infinite Scroll (Scroll Up to fetch older history)
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (container.scrollTop < 80 && detail.hasNextPage && !detail.isFetchingNextPage) {
      prevScrollHeightRef.current = container.scrollHeight;
      isPrependingRef.current = true;
      detail.fetchNextPage().catch(() => {});
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      setShowNewMessageBadge(false);
    }
  };

  // Restore scroll position after prepending older messages
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isPrependingRef.current) {
      isPrependingRef.current = false;
      const scrollDelta = container.scrollHeight - prevScrollHeightRef.current;
      container.scrollTop = container.scrollTop + scrollDelta;
    }
  }, [messages.length]);

  // Initial scroll to bottom & Realtime auto-scroll / New message badge
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (prevMessageCountRef.current === 0 && messages.length > 0) {
      container.scrollTop = container.scrollHeight;
      prevMessageCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        setShowNewMessageBadge(false);
      } else {
        setShowNewMessageBadge(true);
      }
    }
  }, [messages]);

  // Sound alert trigger on new incoming guest messages
  useEffect(() => {
    if (!threads.data?.items) return;
    const latestItem = threads.data.items.reduce<Thread | null>((acc, curr) => {
      if (!acc) return curr;
      return new Date(curr.lastMessageAt) > new Date(acc.lastMessageAt) ? curr : acc;
    }, null);

    if (latestItem?.latestMessage) {
      const msg = latestItem.latestMessage;
      if (
        prevLatestMessageIdRef.current &&
        prevLatestMessageIdRef.current !== msg.id &&
        msg.senderType === "GUEST"
      ) {
        playMessageAlertSound();
      }
      prevLatestMessageIdRef.current = msg.id;
    }
  }, [threads.data]);

  // Listen for peer typing signals across windows/tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSignal = (detail?: { hotelId?: string; threadId?: string; role?: string }) => {
      if (
        detail?.role === "GUEST" &&
        (!detail.threadId || detail.threadId === selectedId) &&
        (!detail.hotelId || detail.hotelId === hotelId)
      ) {
        setIsPeerTyping(true);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => {
          setIsPeerTyping(false);
        }, 3500);
      }
    };

    const handleLocal = (e: Event) => {
      const customEvent = e as CustomEvent<{ hotelId?: string; threadId?: string; role?: string }>;
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
  }, [selectedId, hotelId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["hotel-message-threads", hotelId] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["hotel-message-thread", hotelId, selectedId] }).catch(() => {});
  };

  const reply = useMutation({
    mutationFn: () =>
      requestInternalApi<{ thread: Thread; message: Message }>(`${base}/${encodeURIComponent(selectedId!)}/reply`, {
        method: "POST",
        body: { body: body.trim() },
      }),
    onSuccess: (res) => {
      if (selectedId) {
        setDraftsByThread((prev) => ({ ...prev, [selectedId]: "" }));
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      // Optimistically insert sent message into TanStack Query infinite cache
      if (res?.message) {
        queryClient.setQueryData<{ pages: ThreadPage[]; pageParams: unknown[] }>(
          ["hotel-message-thread", hotelId, selectedId],
          (oldData) => {
            if (!oldData?.pages?.length) return oldData;
            const newPages = [...oldData.pages];
            const firstPage = { ...newPages[0] };
            if (!firstPage.items.some((m) => m.id === res.message.id)) {
              firstPage.items = [...firstPage.items, res.message];
            }
            newPages[0] = firstPage;
            return { ...oldData, pages: newPages };
          },
        );
      }
      refresh();
    },
  });

  const emitTypingSignal = () => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 1500) {
      lastTypingEmitRef.current = now;
      if (typeof window !== "undefined") {
        const payload = { hotelId, threadId: selectedId, role: "STAFF", timestamp: now };
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
    const val = e.target.value;
    if (selectedId) {
      setDraftsByThread((prev) => ({ ...prev, [selectedId]: val }));
    }
    emitTypingSignal();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(48, Math.min(textareaRef.current.scrollHeight, 160))}px`;
    }
  };

  const executeSend = () => {
    const now = Date.now();
    if (now - lastSentAtRef.current < 600) return;
    if (body.trim() && body.length <= 1000 && selectedId && !reply.isPending) {
      lastSentAtRef.current = now;
      reply.mutate();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeSend();
    }
  };

  const clear = useMutation({
    mutationFn: () =>
      requestInternalApi(`${base}/${encodeURIComponent(selectedId!)}`, { method: "PATCH" }),
    onSuccess: () => {
      setSelectedId(null);
      refresh();
      Swal.fire({
        icon: "success",
        title: "Đã dọn dẹp tin nhắn",
        timer: 1500,
        showConfirmButton: false,
      }).catch(() => {});
    },
  });

  function handleConfirmClear() {
    if (!selectedId || clear.isPending) return;
    Swal.fire({
      icon: "warning",
      title: "Xác nhận dọn dẹp tin nhắn?",
      text: "Lịch sử cuộc trò chuyện của phòng này sẽ được làm sạch.",
      showCancelButton: true,
      confirmButtonText: "Dọn dẹp",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#c62828",
    })
      .then((res) => {
        if (res.isConfirmed) {
          clear.mutate();
        }
      })
      .catch(() => {});
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    executeSend();
  }

  const threadItems = threads.data?.items ?? [];
  const filteredThreads = threadItems.filter((thread) => {
    const matchesSearch =
      search === "" ||
      thread.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
      thread.guestName.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="flex flex-col h-[calc(100dvh-7.5rem)] min-h-[540px] gap-2">
      <header className="shrink-0 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">
            LỄ TÂN WORKSPACE
          </p>
          <h1 className="vs-display mt-0.5 text-2xl font-semibold text-[var(--primary)] md:text-3xl">
            Tin nhắn phòng & GuestOS
          </h1>
          <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">
            Trao đổi trực tiếp với khách lưu trú. Tự động lưu theo phiên check-in của từng phòng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#17201b] px-3.5 py-1 text-xs font-bold text-white shadow-sm">
            {threads.data?.total ?? 0} hội thoại
          </span>
        </div>
      </header>

      <section className="flex-1 min-h-0 grid overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] lg:grid-cols-[360px_1fr]">
        {/* Sidebar: Thread List */}
        <aside className={`${selectedId ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] lg:border-b-0 lg:border-r`}>
          <div className="space-y-3 border-b border-[var(--outline-variant)] p-4">
            <div className="relative">
              <VsIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[var(--outline)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm phòng hoặc tên khách..."
                className="h-10 w-full rounded-xl border-0 bg-[var(--surface-container-low,#f4efe6)] pl-9 pr-3 text-sm outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
              />
            </div>
            <button
              type="button"
              onClick={handleConfirmClear}
              disabled={!selectedId || clear.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
              title={selectedId ? `Dọn dẹp lịch sử tin nhắn Phòng ${activeThread?.roomNumber}` : "Chọn phòng để dọn tin nhắn"}
            >
              <VsIcon name="delete_sweep" className="text-base" />
              Dọn tin nhắn {activeThread ? `Phòng ${activeThread.roomNumber}` : ""}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--outline-variant)]/40">
            {filteredThreads.map((thread) => {
              const isSelected = selectedId === thread.id;
              const hasGuestUnread = thread.latestMessage?.senderType === "GUEST";

              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleSelectThread(thread.id)}
                  className={`w-full p-4 text-left transition-all ${
                    isSelected
                      ? "bg-[#17201b]/10 border-l-4 border-l-[var(--primary)]"
                      : "hover:bg-[var(--surface-container-low)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[var(--primary)] px-2 py-0.5 text-xs font-extrabold text-white">
                        Phòng {thread.roomNumber}
                      </span>
                      {hasGuestUnread && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Có tin mới từ khách" />
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--on-surface-variant)]">
                      {formatMessageTime(thread.lastMessageAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-bold text-[var(--primary)] text-sm">{thread.guestName}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-[var(--on-surface-variant)]">
                    {thread.latestMessage?.body ?? "Chưa có tin nhắn"}
                  </p>
                </button>
              );
            })}

            {filteredThreads.length === 0 && (
              <div className="p-8 text-center text-xs text-[var(--on-surface-variant)]">
                {threads.isLoading ? "Đang tải danh sách tin nhắn..." : "Không tìm thấy hội thoại phù hợp."}
              </div>
            )}
          </div>
        </aside>

        {/* Main Conversation Box */}
        <div className={`${selectedId ? "flex" : "hidden lg:flex"} relative min-h-0 flex-col bg-white`}>
          {!selectedId ? (
            <div className="m-auto flex max-w-sm flex-col items-center justify-center p-8 text-center text-[var(--on-surface-variant)]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-container-low)] text-[var(--primary)]">
                <VsIcon name="chat" className="text-3xl" />
              </div>
              <h3 className="mt-4 font-bold text-lg text-[var(--primary)]">Chọn một phòng để mở hội thoại</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--on-surface-variant)]">
                Chọn bất kỳ phòng nào ở cột bên trái để bắt đầu chat trực tiếp hoặc dọn dẹp cuộc trò chuyện.
              </p>
            </div>
          ) : (
            <>
              {/* Header inside Conversation Box */}
              <div className="flex items-center justify-between border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-white font-black text-sm">
                    {activeThread?.roomNumber ?? "..."}
                  </div>
                  <div>
                    <h2 className="vs-display font-bold text-lg text-[var(--primary)]">
                      Phòng {activeThread?.roomNumber ?? "..."}
                    </h2>
                    <p className="text-xs text-[var(--on-surface-variant)] font-medium">
                      Khách: {activeThread?.guestName ?? "..."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-container-low)] text-[var(--primary)] transition hover:bg-red-50 hover:text-red-600"
                    title="Đóng hội thoại"
                    aria-label="Đóng hội thoại"
                  >
                    <VsIcon name="close" className="text-lg" />
                  </button>
                </div>
              </div>

              {/* Chat Message Scroll List */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 bg-[linear-gradient(180deg,#faf7f2_0%,#ffffff_100%)] sm:p-6"
              >
                {detail.isFetchingNextPage && (
                  <div className="flex justify-center py-2 transition-all">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--outline-variant)] bg-white/90 px-4 py-1.5 text-xs font-bold text-[var(--primary)] shadow-md backdrop-blur-md">
                      <VsIcon name="progress_activity" className="animate-spin text-sm text-[var(--secondary)]" />
                      <span>Đang tải tin nhắn cũ hơn...</span>
                    </div>
                  </div>
                )}

                {detail.isLoading && (
                  <div className="space-y-4 py-4 animate-pulse">
                    <div className="flex justify-start">
                      <div className="space-y-1.5 max-w-[65%]">
                        <div className="h-3.5 w-20 rounded bg-black/10" />
                        <div className="h-12 w-56 rounded-2xl rounded-tl-none bg-white border border-[var(--outline-variant)]" />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="space-y-1.5 max-w-[65%] items-end flex flex-col">
                        <div className="h-3.5 w-14 rounded bg-black/10" />
                        <div className="h-10 w-44 rounded-2xl rounded-tr-none bg-[var(--primary)]/20" />
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="space-y-1.5 max-w-[65%]">
                        <div className="h-3.5 w-24 rounded bg-black/10" />
                        <div className="h-14 w-64 rounded-2xl rounded-tl-none bg-white border border-[var(--outline-variant)]" />
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((message) => {
                  const isStaff = message.senderType === "STAFF";
                  const isSystem = message.senderType === "SYSTEM";

                  if (isSystem) {
                    return (
                      <div key={message.id} className="flex justify-center my-2">
                        <span className="rounded-full bg-[var(--surface-container-high)] px-4 py-1 text-[11px] font-semibold text-[var(--on-surface-variant)]">
                          {message.body}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
                      <div className={`min-w-0 max-w-[50%] flex flex-col ${isStaff ? "items-end text-right" : "items-start text-left"}`}>
                        <div className="flex items-center gap-2 px-1 mb-1">
                          <span className="text-[11px] font-bold opacity-75">
                            {isStaff ? (message.senderName ?? "Lễ tân") : activeThread?.guestName ?? "Khách"}
                          </span>
                          <span className="text-[10px] text-[var(--outline)]">
                            {formatMessageTime(message.createdAt)}
                          </span>
                        </div>
                        <div
                          className={`w-fit max-w-full rounded-2xl px-4 py-2.5 text-base shadow-sm leading-relaxed ${
                            isStaff
                              ? "bg-[var(--primary)] text-white rounded-tr-none"
                              : "bg-white border border-[var(--outline-variant)] text-[var(--primary)] rounded-tl-none"
                          }`}
                        >
                          <TypewriterMessageBody body={message.body} createdAt={message.createdAt} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isPeerTyping && (
                  <div className="flex justify-start my-2 transition-all">
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-none bg-white border border-[var(--outline-variant)] px-4 py-2.5 shadow-sm text-xs text-[var(--on-surface-variant)]">
                      <span className="font-bold text-[var(--primary)]">
                        {activeThread?.guestName ?? "Khách"} đang soạn tin nhắn
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce [animation-delay:-0.32s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce [animation-delay:-0.16s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Floating "Tin nhắn mới" Badge */}
              {showNewMessageBadge && (
                <button
                  type="button"
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" });
                      setShowNewMessageBadge(false);
                    }
                  }}
                  className="absolute bottom-20 right-6 z-10 flex items-center gap-1.5 rounded-full bg-[#17201b] px-4 py-2 text-xs font-bold text-white shadow-xl transition hover:scale-105 active:scale-95"
                >
                  <VsIcon name="arrow_downward" className="text-sm animate-bounce" />
                  Tin nhắn mới
                </button>
              )}

              {/* Reply Form */}
              {canReply ? (
                <form
                  onSubmit={submit}
                  className="flex items-end gap-2 border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4"
                >
                  <div className="min-w-0 flex-1">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={body}
                      onChange={handleInput}
                      onKeyDown={handleKeyDown}
                      aria-describedby="staff-message-limit"
                      aria-invalid={body.length > 1000}
                      placeholder="Nhập nội dung trả lời khách (Enter để gửi, Shift+Enter để xuống dòng)..."
                      className="min-h-12 max-h-36 w-full resize-none overflow-y-auto rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <p
                      id="staff-message-limit"
                      className={`mt-1 text-right text-[11px] ${body.length > 1000 ? "font-semibold text-red-700" : "text-[var(--on-surface-variant)]"}`}
                    >
                      Tin nhắn dài tối đa 1000 ký tự. {body.length}/1000
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={!body.trim() || body.length > 1000 || reply.isPending}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-sm font-bold text-white shadow-md transition hover:bg-[var(--primary)]/90 disabled:opacity-40 shrink-0"
                  >
                    <VsIcon name="send" className="text-base" />
                    {reply.isPending ? "Đang gửi..." : "Gửi"}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
