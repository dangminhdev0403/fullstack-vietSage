"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { VietSageBrand } from "@/components/brand/vietsage-brand";
import { REQUEST_DEMO_URL } from "./marketing-links";

// Đồng bộ 100% Tiếng Việt, loại bỏ Health, Blog, B2B theo yêu cầu
const primaryLinks = [
  { label: "Trang chủ", href: "/" },
  { label: "Về chúng tôi", href: "/about" },
  { label: "Liên hệ", href: "/contact" },
];

const solutionLinks = [
  {
    title: "VietSage Hotel",
    href: "/",
    text: "Trải nghiệm khách lưu trú, tự động hóa vận hành và minh bạch báo cáo.",
  },
  {
    title: "VietSage Commerce",
    href: "/commerce",
    text: "Quản lý danh mục, đặt hàng trực tuyến và phân tích kinh doanh.",
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function MarketingHeader({
  accountAction,
  locale = "vi",
}: {
  accountAction: { label: string; href: string };
  locale?: "en" | "vi";
}) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false);
  const solutionsActive = ["/commerce"].some((href) => pathname.startsWith(href));

  const accountLabel =
    accountAction.href === "/dangnhap"
      ? "Đăng nhập"
      : accountAction.href === "/g/home"
        ? "Giao diện khách lưu trú"
        : "Vào trang quản trị";

  useEffect(() => {
    if (!mobileOpen) return;

    firstMobileLinkRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mobileOpen]);

  return (
    <header ref={headerRef} className="vs-mkt-header sticky top-0 z-50">
      <nav
        className="vs-mkt-navbar mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-6"
        aria-label="Điều hướng chính"
      >
        <Link href="/" className="vs-mkt-brand flex min-w-0 items-center">
          <span className="min-w-0">
            <VietSageBrand
              priority
              className="justify-start gap-2 rounded-xl px-2 py-1"
              markClassName="h-9 w-9"
              wordmarkClassName="h-5 w-auto sm:h-6"
            />
            <span className="hidden truncate text-xs font-medium text-[#627064] sm:block">
              Nền tảng công nghệ quản trị khách sạn
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 xl:flex">
          <DesktopNavLink pathname={pathname} href="/" label="Trang chủ" />
          <div className="group relative">
            <button
              className="vs-mkt-nav font-semibold text-sm"
              data-active={solutionsActive ? "true" : undefined}
              type="button"
              aria-haspopup="true"
            >
              Giải pháp
              <span className="ml-1 text-[0.65rem]" aria-hidden="true">&#9662;</span>
            </button>
            <div className="vs-solutions-menu invisible absolute left-1/2 -translate-x-1/2 top-full w-[520px] pt-4 opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-150">
              <div className="grid grid-cols-2 gap-3 rounded-[1.8rem] border border-[#123d2a]/10 bg-[#fffdf7]/95 p-4 shadow-2xl shadow-[#123d2a]/15 backdrop-blur-xl">
                {solutionLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="vs-solution-link rounded-2xl p-4 hover:bg-[#f4ead0] transition-colors"
                    aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                  >
                    <strong className="block text-sm font-bold text-[#123d2a]">{item.title}</strong>
                    <span className="mt-1.5 block text-xs leading-5 text-[#627064]">
                      {item.text}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {primaryLinks.slice(1).map((link) => (
            <DesktopNavLink key={link.href} pathname={pathname} {...link} />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link className="vs-mkt-sign-in hidden sm:inline-flex text-sm font-semibold" href={accountAction.href}>
            {accountLabel}
          </Link>
          <a
            className="vs-mkt-primary-btn hidden rounded-full bg-[#123d2a] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[#123d2a]/20 transition-all hover:bg-[#184d35] md:inline-flex"
            href={REQUEST_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Yêu cầu demo
          </a>
          <button
            className="vs-mobile-menu-toggle grid h-11 w-11 place-items-center rounded-full xl:hidden"
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-menu"
            aria-label={mobileOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className="sr-only">Menu điều hướng</span>
            <span className="vs-mobile-menu-icon" data-open={mobileOpen ? "true" : "false"} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </nav>

      <div
        id="marketing-mobile-menu"
        className="vs-mobile-menu xl:hidden"
        data-open={mobileOpen ? "true" : "false"}
        aria-hidden={!mobileOpen}
      >
        <div className="mx-auto max-w-7xl px-3 pb-3 sm:px-5">
          <div className="rounded-[1.6rem] border border-[#123d2a]/10 bg-[#fffdf7]/98 p-3 shadow-2xl shadow-[#123d2a]/16 backdrop-blur-xl">
            <Link
              ref={firstMobileLinkRef}
              href="/"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={pathname === "/" ? "true" : undefined}
              aria-current={pathname === "/" ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              Trang chủ
            </Link>

            <button
              className="vs-mobile-nav-link flex w-full items-center justify-between text-sm font-semibold"
              type="button"
              data-active={solutionsActive ? "true" : undefined}
              aria-expanded={mobileSolutionsOpen}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileSolutionsOpen((open) => !open)}
            >
              Giải pháp
              <span aria-hidden="true">{mobileSolutionsOpen ? "-" : "+"}</span>
            </button>
            {mobileSolutionsOpen && (
              <div className="grid gap-2 px-2 pb-2 sm:grid-cols-2">
                {solutionLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-2xl bg-[#f4ead0]/70 p-3 text-sm font-bold text-[#123d2a]"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            )}

            {primaryLinks.slice(1).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="vs-mobile-nav-link text-sm font-semibold"
                data-active={isActivePath(pathname, link.href) ? "true" : undefined}
                aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
                tabIndex={mobileOpen ? 0 : -1}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#123d2a]/10 pt-3 sm:hidden">
              <Link className="vs-mkt-sign-in justify-center text-sm font-semibold" href={accountAction.href} tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)}>
                {accountLabel}
              </Link>
              <a
                className="rounded-full bg-[#123d2a] px-4 py-3 text-center text-sm font-bold text-white"
                href={REQUEST_DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={mobileOpen ? 0 : -1}
                onClick={() => setMobileOpen(false)}
              >
                Yêu cầu demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function DesktopNavLink({
  pathname,
  href,
  label,
}: {
  pathname: string;
  href: string;
  label: string;
}) {
  const active = isActivePath(pathname, href);

  return (
    <Link
      className="vs-mkt-nav text-sm font-semibold"
      data-active={active ? "true" : undefined}
      aria-current={active ? "page" : undefined}
      href={href}
    >
      {label}
    </Link>
  );
}
