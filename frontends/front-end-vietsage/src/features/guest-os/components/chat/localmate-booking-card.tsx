"use client";

import { useMemo } from "react";
import Image from "next/image";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import type { GuestChatAction } from "@/features/marketplace/types/marketplace-contract";

export interface LocalMateBookingCardProps {
  action: GuestChatAction;
  onBook: (action: GuestChatAction) => void;
}

export function LocalMateBookingCard({ action, onBook }: LocalMateBookingCardProps) {
  const { locale } = useGuestI18n();
  const { localMate, service } = action;

  const formattedPrice = useMemo(() => {
    const raw = Number(service.unitPrice);
    if (!Number.isFinite(raw) || raw <= 0) return "Liên hệ";
    return new Intl.NumberFormat("vi-VN").format(raw) + " ₫";
  }, [service.unitPrice]);

  const copy = useMemo(() => {
    switch (locale) {
      case "en":
        return {
          verifiedBadge: "Verified LocalMate",
          telegramActive: "Telegram Connected",
          telegramInactive: "Setting up Telegram",
          priceLabel: "Package rate",
          perTour: "/ tour",
          bookButton: "Request Tour Booking",
          languages: "Languages",
        };
      case "zh":
        return {
          verifiedBadge: "官方认证向导",
          telegramActive: "Telegram 已连接",
          telegramInactive: "Telegram 正在配置",
          priceLabel: "服务费用",
          perTour: "/ 次",
          bookButton: "预约此向导",
          languages: "服务语言",
        };
      case "ko":
        return {
          verifiedBadge: "인증된 로컬메이트",
          telegramActive: "텔레그램 연결됨",
          telegramInactive: "텔레그램 연결 대기",
          priceLabel: "투어 요금",
          perTour: "/ 회",
          bookButton: "가이드 예약 요청",
          languages: "구사 언어",
        };
      default:
        return {
          verifiedBadge: "LocalMate Đã xác thực",
          telegramActive: "Telegram Kết nối trực tiếp",
          telegramInactive: "Chờ kết nối Telegram",
          priceLabel: "Giá trọn gói",
          perTour: "/ chuyến",
          bookButton: "Đặt lịch với LocalMate",
          languages: "Ngôn ngữ",
        };
    }
  }, [locale]);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-sm transition-all hover:shadow-md dark:border-emerald-800/40 dark:bg-neutral-900/90">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-emerald-100 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
          {localMate.avatarUrl ? (
            <Image
              src={localMate.avatarUrl}
              alt={localMate.fullName}
              fill
              className="object-cover"
              sizes="56px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-emerald-600 dark:text-emerald-400">
              <VsIcon name="user" className="h-6 w-6" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {localMate.fullName}
            </h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
              <VsIcon name="shield-check" className="h-3 w-3" />
              {copy.verifiedBadge}
            </span>
          </div>

          {/* Rating & Reviews */}
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400">
              <VsIcon name="star" className="h-3.5 w-3.5 fill-current" />
              {localMate.rating.toFixed(1)}
            </span>
            <span>•</span>
            <span>{localMate.totalReviews} đánh giá</span>
            <span>•</span>
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                localMate.telegramReady
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  localMate.telegramReady ? "bg-emerald-500" : "bg-neutral-400"
                }`}
              />
              {localMate.telegramReady ? copy.telegramActive : copy.telegramInactive}
            </span>
          </div>

          {/* Languages & Specialties */}
          {localMate.languages.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="font-medium text-neutral-600 dark:text-neutral-300">
                {copy.languages}:
              </span>
              <span>{localMate.languages.join(", ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Service Highlight */}
      <div className="mt-3 rounded-xl bg-neutral-50/80 p-2.5 dark:bg-neutral-800/50">
        <p className="line-clamp-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {service.name}
        </p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{copy.priceLabel}</span>
          <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
            {formattedPrice}{" "}
            <span className="text-xs font-normal text-neutral-500">{copy.perTour}</span>
          </span>
        </div>
      </div>

      {/* CTA Button */}
      <button
        type="button"
        onClick={() => onBook(action)}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98] dark:bg-emerald-500 dark:hover:bg-emerald-400"
      >
        <VsIcon name="calendar" className="h-4 w-4" />
        <span>{copy.bookButton}</span>
      </button>
    </div>
  );
}
