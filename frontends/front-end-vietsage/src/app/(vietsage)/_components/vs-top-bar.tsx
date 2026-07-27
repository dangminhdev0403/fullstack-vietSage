import Image from "next/image";

import Link from "next/link";

import { VietSageBrand } from "@/components/brand/vietsage-brand";
import { VsIcon } from "./vs-icon";
import { VsLogoutButton } from "./vs-logout-button";
import { ChangePasswordDialog } from "@/features/account/security/change-password-dialog";

type VsTopBarProps = {
  title?: string;
  leftLabel?: string;
  rightLabel?: string;
  subtitle?: string;
  showRightInfo?: boolean;
  titleClassName?: string;
  menuAsButton?: boolean;
  showLeftControl?: boolean;
  rightMode?: "profile" | "icons" | "none";
  brandSize?: "regular" | "large";
  brandLockup?: boolean;
  languageBadge?: string;
};

const profileImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDPd6uCb1c2F8aIIiLrrawFVOrjjuXTN5Vpq9r7j5JSag4DOMkWRMHX4R_Q7EG7KuSaJOYmfZpVcDMsroJlQ58x--oNm0FqYSWCk2KtZnRqBsN9F7JxI4kH-91zWiOKYBK68wda-sKd1T5N4mZfcMyY_s06VVirMasqzCikQ8ytArSK4iL842ulcsli5_KfyWRq_igPogBmoNjbHVq5YqayZYTzH9lQuoTTZaNtSmNntaRKpZ42nLWvYy-kUu0FS8hIuHdDYkDX_kE";

export function VsTopBar({
  title = "VietSage",
  leftLabel = "menu",
  rightLabel = "Khach",
  subtitle,
  showRightInfo = true,
  titleClassName,
  menuAsButton = true,
  showLeftControl = true,
  rightMode = "profile",
  brandSize = "regular",
  brandLockup = true,
  languageBadge = "VI",
}: VsTopBarProps) {
  const icon = leftLabel.toLowerCase() === "back" ? "arrow_back" : "menu";
  const shouldUseButton = icon === "arrow_back" || menuAsButton;
  const shouldRenderBrandLockup =
    brandLockup && title.trim().toLowerCase() === "vietsage";

  const brandMarkClass =
    brandSize === "large"
      ? "h-12 w-12"
      : "h-8 w-8 md:h-10 md:w-10";
  const brandWordmarkClass =
    brandSize === "large"
      ? "h-8 w-auto"
      : "h-5 w-auto md:h-7";

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-[#24473d]/10 bg-[#fff8e8]/78 px-4 shadow-[0_16px_45px_rgba(31,61,53,0.08)] backdrop-blur-xl md:px-10">
      <div className="flex items-center gap-3 md:gap-4">
        {showLeftControl ? (
          shouldUseButton ? (
            <button
              type="button"
              aria-label={icon === "arrow_back" ? "Quay lai" : "Mo menu"}
              className="flex size-11 items-center justify-center rounded-full text-[#24473d] transition-colors hover:bg-[#24473d]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]"
            >
              <VsIcon name={icon} className="text-[24px]" />
            </button>
          ) : (
            <VsIcon name={icon} className="text-[24px] text-[#24473d]" />
          )
        ) : null}

        {shouldRenderBrandLockup ? (
          <VietSageBrand
            priority
            className="gap-2 rounded-xl px-2 py-1 shadow-[0_8px_22px_rgba(31,61,53,0.07)]"
            markClassName={brandMarkClass}
            wordmarkClassName={brandWordmarkClass}
          />
        ) : (
          <p
            className={`vs-display tracking-tight text-[24px] text-[#17201b] ${
              titleClassName ?? "md:text-[48px] md:leading-[1.2]"
            }`}
          >
            {title}
          </p>
        )}
      </div>

      {rightMode === "none" ? null : rightMode === "icons" ? (
        <div className="flex items-center gap-2 text-[#5f6b63]">
          <Link
            href="/g/language"
            aria-label="Change language"
            className="flex size-11 items-center justify-center rounded-full bg-[#e8e5dc] text-[11px] font-black uppercase tracking-[0.08em] text-[#24473d] shadow-[inset_0_0_0_1px_rgba(36,71,61,0.04)] transition-colors hover:bg-[#ded9cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]"
          >
            {languageBadge}
          </Link>
          <button
            type="button"
            aria-label="Tai khoan"
            className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-[#24473d]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]"
          >
            <VsIcon name="account_circle" className="text-[24px]" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-4">
          {showRightInfo ? (
            <div className="hidden min-w-0 max-w-[13rem] flex-col justify-center text-right leading-tight md:flex">
              <span className="truncate text-sm font-bold text-[#17201b]">
                {rightLabel}
              </span>
              {subtitle ? (
                <span className="mt-0.5 truncate text-xs font-medium text-[#5f6b63]">
                  {subtitle}
                </span>
              ) : null}
            </div>
          ) : null}

          <ChangePasswordDialog />
          <VsLogoutButton className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-[#24473d]/15 bg-white/50 px-3 py-2 text-xs font-bold tracking-[0.04em] text-[#24473d] transition-colors hover:bg-[#f8f1e6] disabled:cursor-not-allowed disabled:opacity-60" />

          <div className="size-10 shrink-0 overflow-hidden rounded-full border border-[#24473d]/15 bg-[#f8f1e6] shadow-[0_10px_24px_rgba(31,61,53,0.12)]">
            <Image
              src={profileImage}
              alt={`Ảnh đại diện của ${rightLabel}`}
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      )}
    </header>
  );
}
