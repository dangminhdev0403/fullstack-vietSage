"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import {
  useGuestMarketplaceConversation,
  useGuestMarketplaceOrder,
} from "../queries/use-guest-marketplace";
import type {
  MarketplaceConversationDeliveryStatus,
  MarketplaceConversationMessage,
} from "../types/marketplace-contract";

function generateClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cmsg_${crypto.randomUUID()}`;
  }
  return `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface LocalMateOrderChatProps {
  orderId: string;
  sessionToken: string;
  onBackToAiChat: () => void;
}

export function LocalMateOrderChat({
  orderId,
  sessionToken,
  onBackToAiChat,
}: LocalMateOrderChatProps) {
  const { locale } = useGuestI18n();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: order } = useGuestMarketplaceOrder(sessionToken, orderId);
  const { conversation, sendMessage } = useGuestMarketplaceConversation(
    sessionToken,
    orderId,
  );

  const messages: MarketplaceConversationMessage[] = useMemo(() => {
    return conversation.data?.items ?? [];
  }, [conversation.data?.items]);

  const isTerminal = useMemo(() => {
    const status = order?.status;
    return (
      status === "COMPLETED" ||
      status === "CANCELLED" ||
      status === "REJECTED" ||
      conversation.data?.status === "CLOSED"
    );
  }, [order?.status, conversation.data?.status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const copy = useMemo(() => {
    switch (locale) {
      case "en":
        return {
          headerTitle: "Direct Guide Chat",
          backToAi: "Back to AI Concierge",
          orderLabel: "Order",
          terminalNotice: "This tour order has ended. Chat history is preserved for reference.",
          inputPlaceholder: "Type your message to the guide...",
          send: "Send",
          sending: "Sending...",
          delivery: {
            PENDING: "Sending...",
            SENT: "Forwarded to Telegram",
            FAILED: "Not sent — Tap to retry",
            RECEIVED: "Delivered",
          },
        };
      default:
        return {
          headerTitle: "Trò chuyện với LocalMate",
          backToAi: "Về AI Lễ tân",
          orderLabel: "Đơn",
          terminalNotice: "Đơn tour này đã kết thúc. Lịch sử trao đổi được lưu lại để tra cứu.",
          inputPlaceholder: "Nhập tin nhắn gửi tới hướng dẫn viên...",
          send: "Gửi",
          sending: "Đang gửi...",
          delivery: {
            PENDING: "Đang gửi...",
            SENT: "Đã chuyển tiếp tới Telegram",
            FAILED: "Không gửi được — Bấm để thử lại",
            RECEIVED: "Đã nhận",
          },
        };
    }
  }, [locale]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || isTerminal || sendMessage.isPending) return;

    setInputText("");
    const clientMessageId = generateClientMessageId();

    try {
      await sendMessage.mutateAsync({
        orderId,
        input: {
          body: text,
          clientMessageId,
        },
      });
    } catch {
      // Message failure status will be reflected in conversation
    }
  };

  const handleRetry = async (msg: MarketplaceConversationMessage) => {
    if (msg.senderType !== "GUEST" || msg.deliveryStatus !== "FAILED") return;
    const clientMessageId = generateClientMessageId();
    await sendMessage.mutateAsync({
      orderId,
      input: {
        body: msg.body,
        clientMessageId,
      },
    });
  };

  const renderDeliveryStatus = (status: MarketplaceConversationDeliveryStatus, msg: MarketplaceConversationMessage) => {
    const text = copy.delivery[status] || status;
    const isFailed = status === "FAILED";

    return (
      <div
        className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
          isFailed
            ? "cursor-pointer text-red-500 hover:underline"
            : status === "SENT"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-neutral-400"
        }`}
        onClick={() => isFailed && handleRetry(msg)}
      >
        {status === "SENT" && <VsIcon name="check" className="h-3 w-3" />}
        {isFailed && <VsIcon name="alert-circle" className="h-3 w-3" />}
        <span>{text}</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-neutral-50/50 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200/80 bg-white/95 px-4 py-3 shadow-xs backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToAiChat}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title={copy.backToAi}
          >
            <VsIcon name="arrow-left" className="h-4 w-4" />
          </button>
          <div>
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {copy.headerTitle}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span>
                {copy.orderLabel} #{order?.orderNumber ?? orderId.slice(0, 8)}
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Telegram Bridge
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToAiChat}
          className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {copy.backToAi}
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-neutral-400">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <VsIcon name="message-square" className="h-6 w-6" />
            </div>
            <p className="mt-3 max-w-xs text-xs">
              Kết nối trực tiếp tới Telegram của hướng dẫn viên đã mở. Bạn có thể trao đổi về điểm hẹn, giờ giấc và lịch trình tour.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isGuest = msg.senderType === "GUEST";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isGuest ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                  isGuest
                    ? "bg-emerald-600 text-white"
                    : "border border-neutral-200/80 bg-white text-neutral-900 shadow-2xs dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.body}</p>
              </div>

              {/* Delivery status for guest messages */}
              {isGuest && renderDeliveryStatus(msg.deliveryStatus, msg)}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Notice if terminal */}
      {isTerminal ? (
        <div className="border-t border-neutral-200 bg-neutral-100/80 p-3 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/80">
          {copy.terminalNotice}
        </div>
      ) : (
        /* Input form */
        <form
          onSubmit={handleSend}
          className="border-t border-neutral-200/80 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={copy.inputPlaceholder}
              disabled={sendMessage.isPending}
              className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-900"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sendMessage.isPending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-40"
            >
              <VsIcon name="send" className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
