"use client";

import Link from "next/link";

import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";

import { VsIcon } from "./vs-icon";

type NavKey = "home" | "services" | "requests";

type VsBottomNavProps = {
  active: NavKey;
};

const navItems: Array<{ key: NavKey; labelKey: string; href: string; icon: string }> = [
  { key: "home", labelKey: "nav.home", href: "/g/home", icon: "home" },
  { key: "services", labelKey: "nav.services", href: "/g/services", icon: "reorder" },
  { key: "requests", labelKey: "nav.requests", href: "/g/requests", icon: "notifications" },
];

export function VsBottomNav({ active }: VsBottomNavProps) {
  const { t } = useGuestI18n();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-20 rounded-t-xl border-t border-[color:rgba(198,197,213,0.2)] bg-[color:rgba(249,249,249,0.9)] px-4 shadow-lg backdrop-blur-xl md:hidden">
      <ul
        className="mx-auto flex h-full max-w-[390px] items-center justify-around"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        {navItems.map((item) => {
          const isActive = item.key === active;

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`flex flex-col items-center justify-center rounded-lg p-2 text-[11px] font-semibold transition-all ${
                  isActive
                    ? "scale-110 text-[var(--primary)]"
                    : "text-[color:rgba(70,70,83,0.7)] hover:bg-[color:rgba(226,226,226,0.2)]"
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
