"use client";

import Link from "next/link";

import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";

import { VsIcon } from "./vs-icon";

type NavKey = "home" | "services" | "requests" | "messages";

type VsBottomNavProps = {
  active: NavKey;
};

const navItems: Array<{ key: NavKey; labelKey: string; href: string; icon: string }> = [
  { key: "home", labelKey: "nav.home", href: "/g/home", icon: "home" },
  { key: "services", labelKey: "nav.services", href: "/g/services", icon: "reorder" },
  { key: "requests", labelKey: "nav.requests", href: "/g/requests", icon: "notifications" },
  { key: "messages", labelKey: "nav.messages", href: "/g/messages", icon: "chat" },
];

export function VsBottomNav({ active }: VsBottomNavProps) {
  const { t } = useGuestI18n();

  return (
    <nav
      aria-label="Guest navigation"
      className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t border-[#25483f]/10 bg-[#fffdfa]/92 px-4 shadow-[0_-12px_36px_rgba(31,61,53,0.1)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className="mx-auto flex h-20 max-w-[390px] items-center justify-around"
      >
        {navItems.map((item) => {
          const isActive = item.key === active;

          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`mx-auto flex min-h-11 w-full max-w-24 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26] ${
                  isActive
                    ? "bg-[#25483f]/9 text-[#25483f]"
                    : "text-[#66736b] hover:bg-[#25483f]/6 hover:text-[#25483f]"
                }`}
              >
                <VsIcon name={item.icon} className="text-[22px]" />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
