"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { VietSageBrand } from "@/components/brand/vietsage-brand";
import { LOCALE_OPTIONS, normalizeLocale, type SupportedLocale } from "@/core/i18n/locales";
import { REQUEST_DEMO_URL } from "./marketing-links";

type HeaderCopy = {
  home: string;
  about: string;
  contact: string;
  solutions: string;
  hotelTitle: string;
  hotelDesc: string;
  commerceTitle: string;
  commerceDesc: string;
  brandSubtitle: string;
  demoBtn: string;
  signIn: string;
  guestExp: string;
  dashboard: string;
  selectLanguage: string;
  navAria: string;
  mobileMenuAria: string;
  openMenuAria: string;
  closeMenuAria: string;
};

const HEADER_COPY: Record<SupportedLocale, HeaderCopy> = {
  vi: {
    home: "Trang chủ",
    about: "Về chúng tôi",
    contact: "Liên hệ",
    solutions: "Giải pháp",
    hotelTitle: "VietSage Hotel",
    hotelDesc: "Trải nghiệm khách lưu trú, tự động hóa vận hành và minh bạch báo cáo.",
    commerceTitle: "VietSage Commerce",
    commerceDesc: "Quản lý danh mục, đặt hàng trực tuyến và phân tích kinh doanh.",
    brandSubtitle: "Nền tảng công nghệ quản trị khách sạn",
    demoBtn: "Yêu cầu demo",
    signIn: "Đăng nhập",
    guestExp: "Giao diện khách lưu trú",
    dashboard: "Vào trang quản trị",
    selectLanguage: "Chọn ngôn ngữ",
    navAria: "Điều hướng chính",
    mobileMenuAria: "Menu điều hướng",
    openMenuAria: "Mở menu điều hướng",
    closeMenuAria: "Đóng menu điều hướng",
  },
  en: {
    home: "Home",
    about: "About Us",
    contact: "Contact",
    solutions: "Solutions",
    hotelTitle: "VietSage Hotel",
    hotelDesc: "Guest stay experience, operational automation, and clear reporting.",
    commerceTitle: "VietSage Commerce",
    commerceDesc: "Catalog management, online ordering, and business analytics.",
    brandSubtitle: "Hotel management technology platform",
    demoBtn: "Request Demo",
    signIn: "Sign in",
    guestExp: "Guest Experience",
    dashboard: "Go to Dashboard",
    selectLanguage: "Select language",
    navAria: "Main navigation",
    mobileMenuAria: "Navigation menu",
    openMenuAria: "Open navigation menu",
    closeMenuAria: "Close navigation menu",
  },
  zh: {
    home: "首页",
    about: "关于我们",
    contact: "联系我们",
    solutions: "解决方案",
    hotelTitle: "VietSage Hotel",
    hotelDesc: "住客全流程体验、服务运营自动化与透明数据报表。",
    commerceTitle: "VietSage Commerce",
    commerceDesc: "商品目录管理、在线即时订购与数字化商业分析。",
    brandSubtitle: "酒店数智化运营管理技术平台",
    demoBtn: "预约演示",
    signIn: "登录",
    guestExp: "住客体验",
    dashboard: "进入管理后台",
    selectLanguage: "选择语言",
    navAria: "主导航",
    mobileMenuAria: "导航菜单",
    openMenuAria: "打开导航菜单",
    closeMenuAria: "关闭导航菜单",
  },
  ko: {
    home: "홈",
    about: "회사 소개",
    contact: "문의하기",
    solutions: "솔루션",
    hotelTitle: "VietSage Hotel",
    hotelDesc: "투숙객 경험, 운영 자동화 및 투명한 데이터 리포트.",
    commerceTitle: "VietSage Commerce",
    commerceDesc: "카탈로그 관리, 온라인 주문 및 비즈니스 데이터 분석.",
    brandSubtitle: "호텔 운영 스마트 테크놀로지 플랫폼",
    demoBtn: "데모 신청",
    signIn: "로그인",
    guestExp: "투숙객 전용",
    dashboard: "관리자 페이지",
    selectLanguage: "언어 선택",
    navAria: "메인 내비게이션",
    mobileMenuAria: "내비게이션 메뉴",
    openMenuAria: "내비게이션 메뉴 열기",
    closeMenuAria: "내비게이션 메뉴 닫기",
  },
  ru: {
    home: "Главная",
    about: "О нас",
    contact: "Контакты",
    solutions: "Решения",
    hotelTitle: "VietSage Hotel",
    hotelDesc: "Гостевой опыт, автоматизация процессов и прозрачная отчетность.",
    commerceTitle: "VietSage Commerce",
    commerceDesc: "Управление каталогом, онлайн-заказы и бизнес-аналитика.",
    brandSubtitle: "Технологическая платформа управления отелем",
    demoBtn: "Запросить демо",
    signIn: "Войти",
    guestExp: "Гостевой сервис",
    dashboard: "Панель управления",
    selectLanguage: "Выбор языка",
    navAria: "Главная навигация",
    mobileMenuAria: "Меню навигации",
    openMenuAria: "Открыть меню",
    closeMenuAria: "Закрыть меню",
  },
  hi: {
    home: "होम",
    about: "हमारे बारे में",
    contact: "संपर्क करें",
    solutions: "समाधान",
    hotelTitle: "VietSage Hotel",
    hotelDesc: "अतिथि अनुभव, परिचालन स्वचालन और पारदर्शी रिपोर्टिंग।",
    commerceTitle: "VietSage Commerce",
    commerceDesc: "कैटलॉग प्रबंधन, ऑनलाइन ऑर्डरिंग और व्यावसायिक विश्लेषण।",
    brandSubtitle: "होटल प्रबंधन प्रौद्योगिकी मंच",
    demoBtn: "डेमो का अनुरोध करें",
    signIn: "साइन इन",
    guestExp: "अतिथि अनुभव",
    dashboard: "डैशबोर्ड पर जाएं",
    selectLanguage: "भाषा चुनें",
    navAria: "मुख्य नेविगेशन",
    mobileMenuAria: "नेविगेशन मेनू",
    openMenuAria: "नेविगेशन मेनू खोलें",
    closeMenuAria: "नेविगेशन मेनू बंद करें",
  },
};

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function MarketingHeader({
  accountAction = { label: "Đăng nhập", href: "/dangnhap" },
  locale = "vi",
  onLocaleChange,
}: {
  accountAction?: { label: string; href: string };
  locale?: SupportedLocale;
  onLocaleChange?: (locale: SupportedLocale) => void;
}) {
  const activeLocale = normalizeLocale(locale);
  const t = HEADER_COPY[activeLocale] ?? HEADER_COPY.vi;
  const currentOption = LOCALE_OPTIONS.find((o) => o.code === activeLocale) ?? LOCALE_OPTIONS[0];

  const primaryLinks = [
    { label: t.home, href: "/" },
    { label: t.about, href: "/about" },
    { label: t.contact, href: "/contact" },
  ];

  const solutionLinks = [
    {
      title: t.hotelTitle,
      href: "/",
      text: t.hotelDesc,
    },
    {
      title: t.commerceTitle,
      href: "/commerce",
      text: t.commerceDesc,
    },
  ];

  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const solutionsActive = ["/commerce"].some((href) => pathname.startsWith(href));

  const accountLabel =
    accountAction.href === "/dangnhap"
      ? t.signIn
      : accountAction.href === "/g/home"
        ? t.guestExp
        : t.dashboard;

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLangMenuOpen(false);
    };
    const handleClickOutside = (event: PointerEvent) => {
      if (!langMenuRef.current?.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [langMenuOpen]);

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
        aria-label={t.navAria}
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
              {t.brandSubtitle}
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 xl:flex">
          <DesktopNavLink pathname={pathname} href="/" label={t.home} />
          <div className="group relative">
            <button
              className="vs-mkt-nav font-semibold text-sm"
              data-active={solutionsActive ? "true" : undefined}
              type="button"
              aria-haspopup="true"
            >
              {t.solutions}
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
            {t.demoBtn}
          </a>

          {/* Language Switcher Dropdown */}
          <div className="relative" ref={langMenuRef}>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#123d2a]/20 bg-white/95 px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#123d2a] shadow-sm backdrop-blur-md transition-all hover:border-[#b8872f] hover:bg-white hover:shadow-md hover:ring-2 hover:ring-[#b8872f]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] cursor-pointer"
              onClick={() => setLangMenuOpen((prev) => !prev)}
              aria-expanded={langMenuOpen}
              aria-haspopup="listbox"
              aria-label={t.selectLanguage}
            >
              <svg className="h-4 w-4 text-[#b8872f] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="font-bold tracking-tight">{currentOption.nativeName}</span>
              <span className="text-[10px] text-[#627064] transition-transform duration-150" aria-hidden="true">
                {langMenuOpen ? "▴" : "▾"}
              </span>
            </button>
            {langMenuOpen && (
              <ul
                role="listbox"
                aria-label={t.selectLanguage}
                className="absolute right-0 top-full mt-2 z-50 w-52 overflow-hidden rounded-2xl border border-[#123d2a]/15 bg-white/98 p-1.5 shadow-2xl shadow-[#123d2a]/15 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
              >
                {LOCALE_OPTIONS.map((opt) => (
                  <li key={opt.code} role="option" aria-selected={opt.code === activeLocale}>
                    <button
                      type="button"
                      onClick={() => {
                        onLocaleChange?.(opt.code);
                        setLangMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                        opt.code === activeLocale
                          ? "bg-[#123d2a] text-white font-semibold shadow-sm"
                          : "text-[#123d2a] hover:bg-[#f4ead0]/60"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <svg className="h-4 w-4 text-[#b8872f] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        <span>{opt.nativeName}</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          opt.code === activeLocale ? "bg-[#b8872f]/25 text-[#f3c66b]" : "bg-[#123d2a]/5 text-[#627064]"
                        }`}
                      >
                        {opt.badge}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className="vs-mobile-menu-toggle grid h-11 w-11 place-items-center rounded-full xl:hidden"
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-menu"
            aria-label={mobileOpen ? t.closeMenuAria : t.openMenuAria}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className="sr-only">{t.mobileMenuAria}</span>
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
            {/* Mobile language options */}
            <div className="mb-2.5 border-b border-[#123d2a]/10 pb-3">
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#627064]">
                {t.selectLanguage}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-1">
                {LOCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      onLocaleChange?.(opt.code);
                      setMobileOpen(false);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2 px-2 text-xs font-semibold transition-all ${
                      opt.code === activeLocale
                        ? "bg-[#123d2a] text-white font-semibold shadow-sm ring-1 ring-[#b8872f]"
                        : "bg-[#f4ead0]/50 text-[#123d2a] hover:bg-[#f4ead0]"
                    }`}
                  >
                    <span className="text-base leading-none">{opt.flag}</span>
                    <span>{opt.nativeName}</span>
                  </button>
                ))}
              </div>
            </div>

            <Link
              ref={firstMobileLinkRef}
              href="/"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={pathname === "/" ? "true" : undefined}
              aria-current={pathname === "/" ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.home}
            </Link>

            <button
              className="vs-mobile-nav-link flex w-full items-center justify-between text-sm font-semibold"
              type="button"
              data-active={solutionsActive ? "true" : undefined}
              aria-expanded={mobileSolutionsOpen}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileSolutionsOpen((open) => !open)}
            >
              {t.solutions}
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
                {t.demoBtn}
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
