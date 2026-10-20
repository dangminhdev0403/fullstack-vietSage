"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface FooterLinkItem {
  label: string;
  href: string;
}

const PROTECTED_MARKETING_PATHS = new Set([
  "/giai-phap",
  "/gia",
  "/tich-hop",
]);

export function MarketingFooterLinks({ links }: { links: FooterLinkItem[] }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (!isMounted) return;
        if (
          session &&
          (session.user?.id || (session.activeRoleCode && !session.authError))
        ) {
          setIsAuthenticated(true);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleLinks = links.filter(
    (link) => isAuthenticated || !PROTECTED_MARKETING_PATHS.has(link.href),
  );

  return (
    <div className="mt-4 space-y-2.5">
      {visibleLinks.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          className="block text-sm text-white/65 hover:text-white transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
