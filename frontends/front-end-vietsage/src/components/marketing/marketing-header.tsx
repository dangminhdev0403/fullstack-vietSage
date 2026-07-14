"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const primaryLinks = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "B2B", href: "/b2b" },
  { label: "Contact", href: "/contact" },
];

const solutionLinks = [
  {
    title: "VietSage Hotel",
    href: "/",
    text: "Guest service, operations, and management visibility.",
  },
  {
    title: "VietSage Commerce",
    href: "/commerce",
    text: "Catalogs, ordering, and business reporting.",
  },
  {
    title: "VietSage Health",
    href: "/health",
    text: "Digital journeys, scheduling, and service operations.",
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function MarketingHeader() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false);
  const solutionsActive = ["/commerce", "/health"].some((href) =>
    pathname.startsWith(href),
  );

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
        aria-label="Main navigation"
      >
        <Link href="/" className="vs-mkt-brand flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[1.1rem] bg-[#123d2a] shadow-lg shadow-[#123d2a]/20 ring-1 ring-white/50">
            <Image src="/brand/vietsage-icon.png" alt="" width={25} height={25} priority />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black tracking-[0.24em] text-[#123d2a]">
              VIETSAGE
            </span>
            <span className="hidden truncate text-xs text-[#627064] sm:block">
              Hospitality technology platform
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 xl:flex">
          <DesktopNavLink pathname={pathname} href="/" label="Home" />
          <div className="group relative">
            <button
              className="vs-mkt-nav"
              data-active={solutionsActive ? "true" : undefined}
              type="button"
              aria-haspopup="true"
            >
              Solutions
              <span className="ml-1 text-[0.65rem]" aria-hidden="true">&#9662;</span>
            </button>
            <div className="vs-solutions-menu invisible absolute left-1/2 top-full w-[680px] pt-4 opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="grid grid-cols-3 gap-3 rounded-[2rem] border border-[#123d2a]/10 bg-[#fffdf7]/95 p-4 shadow-2xl shadow-[#123d2a]/15 backdrop-blur-xl">
                {solutionLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="vs-solution-link rounded-3xl p-4 hover:bg-[#f4ead0]"
                    aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                  >
                    <strong className="block text-[#123d2a]">{item.title}</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#627064]">
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
          <Link className="vs-mkt-sign-in hidden sm:inline-flex" href="/login">
            Sign in
          </Link>
          <Link
            className="vs-mkt-primary-btn hidden rounded-full bg-[#123d2a] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#123d2a]/20 md:inline-flex"
            href="/contact"
          >
            Request demo
          </Link>
          <button
            className="vs-mobile-menu-toggle grid h-11 w-11 place-items-center rounded-full xl:hidden"
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-menu"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className="sr-only">Menu</span>
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
              className="vs-mobile-nav-link"
              data-active={pathname === "/" ? "true" : undefined}
              aria-current={pathname === "/" ? "page" : undefined}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              Home
            </Link>

            <button
              className="vs-mobile-nav-link flex w-full items-center justify-between"
              type="button"
              data-active={solutionsActive ? "true" : undefined}
              aria-expanded={mobileSolutionsOpen}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileSolutionsOpen((open) => !open)}
            >
              Solutions
              <span aria-hidden="true">{mobileSolutionsOpen ? "-" : "+"}</span>
            </button>
            {mobileSolutionsOpen && (
              <div className="grid gap-2 px-2 pb-2 sm:grid-cols-3">
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
                className="vs-mobile-nav-link"
                data-active={isActivePath(pathname, link.href) ? "true" : undefined}
                aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
                tabIndex={mobileOpen ? 0 : -1}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#123d2a]/10 pt-3 sm:hidden">
              <Link className="vs-mkt-sign-in justify-center" href="/login" tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
              <Link className="rounded-full bg-[#123d2a] px-4 py-3 text-center text-sm font-black text-white" href="/contact" tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)}>
                Request demo
              </Link>
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
      className="vs-mkt-nav"
      data-active={active ? "true" : undefined}
      aria-current={active ? "page" : undefined}
      href={href}
    >
      {label}
    </Link>
  );
}
