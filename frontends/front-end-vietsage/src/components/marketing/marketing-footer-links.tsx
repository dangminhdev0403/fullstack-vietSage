import Link from "next/link";

export interface FooterLinkItem {
  label: string;
  href: string;
}

export function MarketingFooterLinks({ links }: { links: FooterLinkItem[] }) {
  return (
    <div className="mt-4 space-y-2.5">
      {links.map((link) => (
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
