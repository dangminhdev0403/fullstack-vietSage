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
  pricing: string;
  integrations: string;
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
  lifecycleHeading: string;
  propertiesHeading: string;
  allSolutionsLink: string;
};

const HEADER_COPY: Record<SupportedLocale, HeaderCopy> = {
  vi: {
    home: "Trang chủ",
    about: "Về chúng tôi",
    contact: "Liên hệ",
    solutions: "Giải pháp",
    pricing: "Bảng giá",
    integrations: "Tích hợp",
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
    lifecycleHeading: "Theo chu trình vận hành",
    propertiesHeading: "Mô hình khách sạn",
    allSolutionsLink: "Xem toàn bộ giải pháp →",
  },
  en: {
    home: "Home",
    about: "About Us",
    contact: "Contact",
    solutions: "Solutions",
    pricing: "Pricing",
    integrations: "Integrations",
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
    lifecycleHeading: "Operational Lifecycle",
    propertiesHeading: "Property Types",
    allSolutionsLink: "View all solutions →",
  },
  zh: {
    home: "首页",
    about: "关于我们",
    contact: "联系我们",
    solutions: "解决方案",
    pricing: "价格方案",
    integrations: "生态集成",
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
    lifecycleHeading: "运营全流程",
    propertiesHeading: "适用业态",
    allSolutionsLink: "查看全部方案 →",
  },
  ko: {
    home: "홈",
    about: "회사 소개",
    contact: "문의하기",
    solutions: "솔루션",
    pricing: "요금 안내",
    integrations: "시스템 연동",
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
    lifecycleHeading: "운영 라이프사이클",
    propertiesHeading: "숙박 시설 유형",
    allSolutionsLink: "모든 솔루션 보기 →",
  },
  ru: {
    home: "Главная",
    about: "О нас",
    contact: "Контакты",
    solutions: "Решения",
    pricing: "Тарифы",
    integrations: "Интеграции",
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
    lifecycleHeading: "Жизненный цикл",
    propertiesHeading: "Типы объектов",
    allSolutionsLink: "Все решения →",
  },
  hi: {
    home: "होम",
    about: "हमारे बारे में",
    contact: "संपर्क करें",
    solutions: "समाधान",
    pricing: "मूल्य निर्धारण",
    integrations: "एकीकरण",
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
    lifecycleHeading: "परिचालन चक्र",
    propertiesHeading: "होटल के प्रकार",
    allSolutionsLink: "सभी समाधान देखें →",
  },
};

function isActivePath(pathname: string | null | undefined, href: string) {
  if (!pathname) return false;

  const normalize = (path: string) => {
    const trimmed = path.trim();
    if (trimmed.length > 1 && trimmed.endsWith("/")) {
      return trimmed.slice(0, -1);
    }
    return trimmed;
  };

  const normalizedPath = normalize(pathname);
  const normalizedHref = normalize(href);

  if (normalizedHref === "/") {
    return normalizedPath === "/";
  }

  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
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

  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

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
        className="vs-mkt-navbar mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 lg:py-3.5"
        aria-label={t.navAria}
      >
        <Link
          href="/"
          className="vs-mkt-brand flex shrink-0 flex-col items-start justify-center group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ba8c2f]"
        >
          <VietSageBrand
            priority
            className="justify-start gap-1.5 sm:gap-2 rounded-xl px-1.5 py-0.5 sm:px-2"
            markClassName="h-6 w-6 sm:h-7 sm:w-7"
            wordmarkClassName="h-4 w-auto sm:h-5"
          />
          <span className="mt-1 px-1 block text-xs font-medium tracking-tight text-[#627064] transition-colors group-hover:text-[#825916]">
            {t.brandSubtitle}
          </span>
        </Link>

        <div className="hidden shrink-0 items-center gap-1 xl:flex">
          <DesktopNavLink pathname={pathname} href="/" label={t.home} />
          <DesktopNavLink pathname={pathname} href="/giai-phap" label={t.solutions} />
          <DesktopNavLink pathname={pathname} href="/gia" label={t.pricing} />
          <DesktopNavLink pathname={pathname} href="/tich-hop" label={t.integrations} />
          <DesktopNavLink pathname={pathname} href="/about" label={t.about} />
          <DesktopNavLink pathname={pathname} href="/contact" label={t.contact} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link className="vs-mkt-sign-in hidden shrink-0 whitespace-nowrap sm:inline-flex text-sm font-semibold" href={accountAction.href}>
            {accountLabel}
          </Link>
          <a
            className="vs-mkt-primary-btn hidden shrink-0 whitespace-nowrap rounded-full bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] px-4 py-2 sm:px-5 sm:py-2.5 text-sm font-bold text-white shadow-md shadow-[#825916]/20 transition-all hover:brightness-105 hover:shadow-lg hover:shadow-[#825916]/30 md:inline-flex"
            href={REQUEST_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.demoBtn}
          </a>

          {/* Language Switcher Dropdown */}
          <div className="relative shrink-0" ref={langMenuRef}>
            <button
              type="button"
              className="inline-flex h-9 sm:h-10 shrink-0 whitespace-nowrap items-center gap-1.5 sm:gap-2 rounded-full border border-[#123d2a]/20 bg-white/95 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-[#123d2a] shadow-sm backdrop-blur-md transition-all hover:border-[#b8872f] hover:bg-white hover:shadow-md hover:ring-2 hover:ring-[#b8872f]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] cursor-pointer"
              onClick={() => setLangMenuOpen((prev) => !prev)}
              aria-expanded={langMenuOpen}
              aria-haspopup="listbox"
              aria-label={t.selectLanguage}
            >
              <svg className="h-4 w-4 text-[#b8872f] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="hidden sm:inline font-bold tracking-tight">{currentOption.nativeName}</span>
              <span className="sm:hidden font-bold tracking-tight text-xs">{currentOption.badge}</span>
              <span className="text-xs text-[#627064] transition-transform duration-150" aria-hidden="true">
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
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${
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
            className="vs-mobile-menu-toggle grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-full xl:hidden"
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
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-[#627064]">
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
              data-active={isActivePath(pathname, "/") ? "true" : undefined}
              aria-current={isActivePath(pathname, "/") ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.home}
            </Link>

            <Link
              href="/giai-phap"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={isActivePath(pathname, "/giai-phap") ? "true" : undefined}
              aria-current={isActivePath(pathname, "/giai-phap") ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.solutions}
            </Link>

            <Link
              href="/gia"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={isActivePath(pathname, "/gia") ? "true" : undefined}
              aria-current={isActivePath(pathname, "/gia") ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.pricing}
            </Link>

            <Link
              href="/tich-hop"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={isActivePath(pathname, "/tich-hop") ? "true" : undefined}
              aria-current={isActivePath(pathname, "/tich-hop") ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.integrations}
            </Link>

            <Link
              href="/about"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={isActivePath(pathname, "/about") ? "true" : undefined}
              aria-current={isActivePath(pathname, "/about") ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.about}
            </Link>

            <Link
              href="/contact"
              className="vs-mobile-nav-link text-sm font-semibold"
              data-active={isActivePath(pathname, "/contact") ? "true" : undefined}
              aria-current={isActivePath(pathname, "/contact") ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              {t.contact}
            </Link>

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#123d2a]/10 pt-3 sm:hidden">
              <Link className="vs-mkt-sign-in justify-center text-sm font-semibold" href={accountAction.href} tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)}>
                {accountLabel}
              </Link>
              <a
                className="rounded-full bg-gradient-to-r from-[#825916] via-[#9e7120] to-[#ba8c2f] px-4 py-3 text-center text-sm font-bold text-white shadow-md shadow-[#825916]/20"
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
      className="vs-mkt-nav inline-flex shrink-0 items-center whitespace-nowrap text-sm font-semibold"
      data-active={active ? "true" : undefined}
      aria-current={active ? "page" : undefined}
      href={href}
    >
      {label}
    </Link>
  );
}
