"use client";

import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { HttpError } from "@/core/http/http-error";
import { requestInternalApi } from "@/core/http/internal-api-client";
import { playMessageAlertSound } from "@/features/request-realtime/audio-notifier";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";

type Message = {
  id: string;
  senderType: "GUEST" | "STAFF" | "SYSTEM";
  senderName: string | null;
  body: string;
  createdAt: string;
  readAt?: string | null;
};

type Thread = {
  id: string;
  stayId: string;
  status: string;
  roomNumber: string;
  floor: string | null;
  roomType: string | null;
  guestName: string;
  lastMessageAt: string;
  unreadCount: number;
  latestMessage: Message | null;
};

type ThreadList = {
  items: Thread[];
  total: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};
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
    <p className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-left">
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false);
  const [closedStayId, setClosedStayId] = useState<string | null>(null);

  const body = selectedId ? (draftsByThread[selectedId] ?? "") : "";

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isPrependingRef = useRef<boolean>(false);
  const prevMessageCountRef = useRef<number>(0);
  const justSentRef = useRef<boolean>(false);
  const isNearBottomRef = useRef<boolean>(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastTypingEmitRef = useRef<number>(0);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const peerTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectThread = (id: string | null) => {
    if (id !== selectedId) {
      setSelectedId(id);
      setShowNewMessageBadge(false);
      setClosedStayId(null);
      prevMessageCountRef.current = 0;
    }
    if (id) {
      requestInternalApi(`${base}/${encodeURIComponent(id)}/read`, { method: "POST" })
        .then(() => markThreadReadInCache(id))
        .catch(() => {});
    }
  };

  const threadListKey = ["hotel-message-threads", hotelId, deferredSearch] as const;
  const threads = useInfiniteQuery<ThreadList, Error, InfiniteData<ThreadList>, typeof threadListKey, string | undefined>({
    queryKey: threadListKey,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "30" });
      if (pageParam) params.set("cursor", pageParam);
      if (deferredSearch) params.set("q", deferredSearch);
      return requestInternalApi<ThreadList>(`${base}?${params.toString()}`, { method: "GET" });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    refetchInterval: 30_000,
  });

  const markThreadReadInCache = (threadId: string) => {
    queryClient.setQueriesData<InfiniteData<ThreadList>>(
      { queryKey: ["hotel-message-threads", hotelId] },
      (current) => current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((thread) =>
                thread.id === threadId ? { ...thread, unreadCount: 0 } : thread,
              ),
            })),
          }
        : current,
    );
  };

  const threadItems = (threads.data?.pages ?? [])
    .flatMap((page) => page.items)
    .reduce<Thread[]>((items, thread) => {
      if (!items.some((item) => item.id === thread.id)) items.push(thread);
      return items;
    }, []);

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
    refetchInterval: closedStayId ? false : 30_000,
    retry: false,
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
  const selectedThread = activeThread ?? threadItems.find((thread) => thread.id === selectedId);
  const conversationClosed = Boolean(
    selectedThread && (
      closedStayId === selectedThread.stayId ||
      (detail.error instanceof HttpError && detail.error.status === 404)
    ),
  );

  const appendMessageToThreadCache = (threadId: string, message: Message) => {
    queryClient.setQueryData<InfiniteData<ThreadPage>>(
      ["hotel-message-thread", hotelId, threadId],
      (current) => {
        if (!current?.pages.length || current.pages.some((page) => page.items.some((item) => item.id === message.id))) {
          return current;
        }
        const nextPages = [...current.pages];
        nextPages[0] = { ...nextPages[0], items: [...nextPages[0].items, message] };
        return { ...current, pages: nextPages };
      },
    );
  };

  const upsertWaitingThread = (thread: Thread) => {
    if (
      deferredSearch &&
      !thread.roomNumber.toLowerCase().includes(deferredSearch.toLowerCase()) &&
      !thread.guestName.toLowerCase().includes(deferredSearch.toLowerCase())
    ) return;

    queryClient.setQueryData<InfiniteData<ThreadList>>(threadListKey, (current) => {
      if (!current?.pages.length) return current;
      const existed = current.pages.some((page) => page.items.some((item) => item.id === thread.id));
      const pages = current.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== thread.id),
      }));
      pages[0] = { ...pages[0], items: [thread, ...pages[0].items] };
      return {
        ...current,
        pages: pages.map((page, index) => index === 0
          ? { ...page, total: existed ? page.total : page.total + 1 }
          : page),
      };
    });
  };

  const removeClosedStayFromWaitingList = (stayId: string) => {
    queryClient.setQueriesData<InfiniteData<ThreadList>>(
      { queryKey: ["hotel-message-threads", hotelId] },
      (current) => {
        if (!current) return current;
        const removed = current.pages.some((page) => page.items.some((thread) => thread.stayId === stayId));
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            total: removed ? Math.max(0, page.total - 1) : page.total,
            items: page.items.filter((thread) => thread.stayId !== stayId),
          })),
        };
      },
    );
  };

  useOwnerRequestRealtime(
    hotelId,
    {
      onGuestMessageCreated: (event) => {
        if (!event || typeof event !== "object" || !("thread" in event) || !("message" in event)) return;
        const { thread, message } = event as { thread: Thread; message: Message };
        if (!thread?.id || !message?.id) return;

        const isOpenThread = selectedId === thread.id;
        upsertWaitingThread({
          ...thread,
          latestMessage: message,
          unreadCount: isOpenThread ? 0 : thread.unreadCount,
        });
        if (isOpenThread) {
          appendMessageToThreadCache(thread.id, message);
          if (message.senderType === "GUEST") {
            requestInternalApi(`${base}/${encodeURIComponent(thread.id)}/read`, { method: "POST" })
              .then(() => markThreadReadInCache(thread.id))
              .catch(() => {});
          }
        }
        if (message.senderType === "GUEST") playMessageAlertSound();
      },
      onConversationClosed: (event) => {
        if (!event || typeof event !== "object" || !("stayId" in event)) return;
        const stayId = String(event.stayId);
        removeClosedStayFromWaitingList(stayId);
        if (selectedThread?.stayId === stayId) setClosedStayId(stayId);
      },
      onReconnect: () => {
        queryClient.invalidateQueries({ queryKey: ["hotel-message-threads", hotelId] }).catch(() => {});
        if (selectedId) {
          queryClient.invalidateQueries({ queryKey: ["hotel-message-thread", hotelId, selectedId] }).catch(() => {});
        }
      },
    },
    { showConnectionToasts: false },
  );

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
    isNearBottomRef.current = isNearBottom;
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
      const hasJustSent = justSentRef.current;
      justSentRef.current = false;
      prevMessageCountRef.current = messages.length;
      if (hasJustSent || isNearBottomRef.current) {
        setShowNewMessageBadge(false);
        const scrollToBottom = () => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        };
        scrollToBottom();
        requestAnimationFrame(scrollToBottom);
        setTimeout(scrollToBottom, 50);
        setTimeout(scrollToBottom, 150);
      } else {
        setShowNewMessageBadge(true);
      }
    }
  }, [messages, pages.length]);

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

  const reply = useMutation({
    mutationFn: (variables: { threadId: string; body: string }) =>
      requestInternalApi<{ thread: Thread; message: Message }>(`${base}/${encodeURIComponent(variables.threadId)}/reply`, {
        method: "POST",
        body: { body: variables.body },
      }),
    onMutate: () => setSendError(null),
    onSuccess: (res, variables) => {
      setDraftsByThread((prev) =>
        prev[variables.threadId]?.trim() === variables.body
          ? { ...prev, [variables.threadId]: "" }
          : prev,
      );
      justSentRef.current = true;
      // Optimistically insert sent message into the submitted thread cache.
      if (res?.message) {
        queryClient.setQueryData<{ pages: ThreadPage[]; pageParams: unknown[] }>(
          ["hotel-message-thread", hotelId, variables.threadId],
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
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      upsertWaitingThread({ ...res.thread, latestMessage: res.message, unreadCount: 0 });
    },
    onError: () => setSendError("Không thể gửi tin nhắn. Vui lòng thử lại."),
  });

  useEffect(() => {
    if (reply.isPending && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [reply.isPending]);

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

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (selectedId) {
      setDraftsByThread((prev) => ({ ...prev, [selectedId]: val }));
    }
    setSendError(null);
    emitTypingSignal();
  };

  const executeSend = () => {
    const now = Date.now();
    if (now - lastSentAtRef.current < 600) return;
    if (!body.trim() || !selectedId || reply.isPending) return;
    if (body.length > 1000) {
      setSendError("Tin nhắn vượt quá 1000 ký tự. Hãy rút gọn trước khi gửi.");
      return;
    }
    lastSentAtRef.current = now;
    justSentRef.current = true;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
    reply.mutate({ threadId: selectedId, body: body.trim() });
  };



  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    executeSend();
  }

  const handleThreadListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const nearEnd = container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    if (nearEnd && threads.hasNextPage && !threads.isFetchingNextPage) {
      threads.fetchNextPage().catch(() => {});
    }
  };

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
            {threads.data?.pages[0]?.total ?? 0} hội thoại
          </span>
        </div>
      </header>

      <section className="flex-1 min-h-0 grid overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] lg:grid-cols-[360px_1fr]">
        {/* Sidebar: Thread List */}
        <aside className={`${selectedId ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] lg:border-b-0 lg:border-r`}>
          <div className="border-b border-[var(--outline-variant)] p-4">
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
          </div>

          <div onScroll={handleThreadListScroll} className="flex-1 overflow-y-auto divide-y divide-[var(--outline-variant)]/40">
            {threadItems.map((thread) => {
              const isSelected = selectedId === thread.id;
              const hasGuestUnread = thread.unreadCount > 0;

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
                        <span className="min-w-5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white" title="Có tin mới từ khách">
                          {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                        </span>
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

            {threads.isFetchingNextPage ? (
              <div className="p-3 text-center text-xs text-[var(--on-surface-variant)]">Đang tải thêm hội thoại...</div>
            ) : null}

            {threadItems.length === 0 && (
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
                Chọn một phòng ở cột bên trái để trao đổi với khách đang lưu trú.
              </p>
            </div>
          ) : (
            <>
              {/* Header inside Conversation Box */}
              <div className="flex items-center justify-between border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-white font-black text-sm">
                    {selectedThread?.roomNumber ?? "..."}
                  </div>
                  <div>
                    <h2 className="vs-display font-bold text-lg text-[var(--primary)]">
                      Phòng {selectedThread?.roomNumber ?? "..."}
                    </h2>
                    <p className="text-xs text-[var(--on-surface-variant)] font-medium">
                      Khách: {selectedThread?.guestName ?? "..."}
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

              {conversationClosed ? (
                <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
                  <div>
                    <p className="font-bold">Phiên trò chuyện đã kết thúc.</p>
                    <p className="text-xs">Khách đã checkout; lịch sử này không còn xuất hiện trong hàng chờ.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="shrink-0 rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white"
                  >
                    Quay về danh sách
                  </button>
                </div>
              ) : null}

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
                            {isStaff ? (message.senderName ?? "Lễ tân") : selectedThread?.guestName ?? "Khách"}
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
                        {selectedThread?.guestName ?? "Khách"} đang soạn tin nhắn
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
              {canReply && !conversationClosed ? (
                <form
                  onSubmit={submit}
                  className="flex items-end gap-2 border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4"
                >
                  <div className="min-w-0 flex-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={body}
                      onChange={handleInput}
                      aria-describedby="staff-message-limit"
                      aria-invalid={body.length > 1000}
                      placeholder="Nhập nội dung trả lời khách (Enter để gửi)..."
                      className="h-12 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <p
                      id="staff-message-limit"
                      className={`mt-1 text-right text-[11px] ${body.length > 1000 ? "font-semibold text-red-700" : "text-[var(--on-surface-variant)]"}`}
                    >
                      Tin nhắn dài tối đa 1000 ký tự. {body.length}/1000
                    </p>
                    {sendError ? <p role="alert" className="mt-1 text-sm font-semibold text-red-700">{sendError}</p> : null}
                  </div>
                  <button
                    type="submit"
                    disabled={!body.trim() || reply.isPending}
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
