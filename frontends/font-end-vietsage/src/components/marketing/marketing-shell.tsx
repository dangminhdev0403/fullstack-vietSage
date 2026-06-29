import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const solutionLinks = [
  { title: "VietSage Hotel", href: "/", text: "Hospitality technology for guest service, operations, and management visibility." },
  { title: "VietSage Commerce", href: "/commerce", text: "A service-commerce direction for catalogs, ordering, and business reporting." },
  { title: "VietSage Health", href: "/health", text: "A future vertical for digital journeys, scheduling, and service operations." },
];

export const stats = [
  ["QR", "guest service access"],
  ["Multi", "language support"],
  ["Live", "operations visibility"],
  ["Scale", "property growth"],
];

type CardItem = { title: string; text: string };

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f3e8] text-[#132119]">
      <header className="sticky top-0 z-50 border-b border-[#132119]/10 bg-[#f7f3e8]/86 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8" aria-label="Main navigation">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#123d2a]">
              <Image src="/brand/vietsage-icon.png" alt="VietSage" width={25} height={25} />
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.24em] text-[#123d2a]">VIETSAGE</span>
              <span className="text-xs text-[#627064]">Hospitality technology platform</span>
            </span>
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            <Link className="vs-mkt-nav" href="/">Home</Link>
            <div className="group relative">
              <button className="vs-mkt-nav" type="button">Solutions</button>
              <div className="invisible absolute left-1/2 top-full w-[680px] -translate-x-1/2 pt-4 opacity-0 transition group-hover:visible group-hover:opacity-100">
                <div className="grid grid-cols-3 gap-3 rounded-[2rem] border border-[#123d2a]/10 bg-white/95 p-4 shadow-2xl shadow-[#123d2a]/15 backdrop-blur-xl">
                  {solutionLinks.map((item) => (
                    <Link key={item.href} href={item.href} className="rounded-3xl p-4 transition hover:bg-[#f4ead0]">
                      <strong className="block text-[#123d2a]">{item.title}</strong>
                      <span className="mt-2 block text-sm leading-6 text-[#627064]">{item.text}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link className="vs-mkt-nav" href="/about">About Us</Link>
            <Link className="vs-mkt-nav" href="/blog">Blog</Link>
            <Link className="vs-mkt-nav" href="/b2b">B2B</Link>
            <Link className="vs-mkt-nav" href="/contact">Contact</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link className="hidden rounded-full px-4 py-2 text-sm font-bold text-[#123d2a] sm:inline-flex" href="/login">Sign in</Link>
            <Link className="rounded-full bg-[#123d2a] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-[#123d2a]/20" href="/contact">Request demo</Link>
          </div>
        </nav>
      </header>
      {children}
      <Footer />
    </div>
  );
}

export function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-black uppercase tracking-[0.26em] text-[#b8872f]">{eyebrow}</p>
      <h2 className="vs-display mt-3 text-4xl font-black tracking-[-0.04em] text-[#123d2a] md:text-6xl">{title}</h2>
      <p className="mt-5 text-lg leading-8 text-[#627064]">{text}</p>
    </div>
  );
}

export function Hero({ eyebrow, title, text, image, children }: { eyebrow: string; title: string; text: string; image: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(184,135,47,.22),transparent_32%),linear-gradient(135deg,#f7f3e8,#edf5ea)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.04fr_.96fr] lg:px-8 lg:py-24">
        <div className="vs-landing-reveal">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#b8872f]">{eyebrow}</p>
          <h1 className="vs-display mt-5 text-5xl font-black leading-[.94] tracking-[-0.06em] text-[#123d2a] md:text-7xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-xl leading-9 text-[#4d5b50]">{text}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="rounded-full bg-[#123d2a] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-[#123d2a]/20" href="/contact">Request Demo</Link>
            <Link className="rounded-full border border-[#123d2a]/20 bg-white/70 px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#123d2a]" href="/contact">Contact Sales</Link>
          </div>
          {children}
        </div>
        <div className="vs-landing-reveal relative min-h-[420px] overflow-hidden rounded-[2rem] shadow-2xl shadow-[#123d2a]/18">
          <Image src={image} alt="VietSage platform visual" fill priority className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#123d2a]/88 via-[#123d2a]/14 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-white/90 p-5 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b8872f]">Live dashboard preview</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {stats.slice(0, 3).map(([value, label]) => (
                <div key={label} className="rounded-2xl bg-[#f7f3e8] p-3">
                  <strong className="text-2xl text-[#123d2a]">{value}</strong>
                  <span className="block text-xs text-[#627064]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CardGrid({ items }: { items: CardItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} className="vs-landing-reveal rounded-[1.7rem] border border-[#123d2a]/10 bg-white/78 p-6 shadow-xl shadow-[#123d2a]/6">
          <div className="mb-5 h-2 w-16 rounded-full bg-[#d7a84d]" />
          <h3 className="text-2xl font-black text-[#123d2a]">{item.title}</h3>
          <p className="mt-3 leading-7 text-[#627064]">{item.text}</p>
        </article>
      ))}
    </div>
  );
}

export function CTA() {
  return (
    <section className="px-5 py-16 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#123d2a] p-8 text-white shadow-2xl shadow-[#123d2a]/20 md:p-12">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f3c66b]">Ready for modern hospitality operations?</p>
            <h2 className="vs-display mt-3 text-4xl font-black md:text-6xl">Design your VietSage rollout.</h2>
            <p className="mt-4 max-w-2xl text-white/72">Talk with our team about hotel operations, guest journeys, multilingual services, integrations, and secure deployment models.</p>
          </div>
          <Link href="/contact" className="rounded-full bg-[#f3c66b] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#123d2a]">Request Demo</Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { heading: "Company", links: [{ label: "About Us", href: "/about" }, { label: "Contact", href: "/contact" }, { label: "B2B", href: "/b2b" }] },
    { heading: "Solutions", links: [{ label: "VietSage Hotel", href: "/" }, { label: "VietSage Commerce", href: "/commerce" }, { label: "VietSage Health", href: "/health" }] },
    { heading: "Resources", links: [{ label: "Blog", href: "/blog" }, { label: "Privacy Policy", href: "#" }, { label: "Terms", href: "#" }] },
  ];
  return (
    <footer className="border-t border-[#123d2a]/10 bg-[#10251a] px-5 py-12 text-white lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_2fr]">
        <div>
          <h2 className="text-xl font-black tracking-[0.22em] text-[#f3c66b]">VIETSAGE</h2>
          <p className="mt-4 max-w-sm text-white/65">Premium technology platforms for hospitality operations, service commerce, and future healthcare workflows.</p>
          <p className="mt-6 text-sm text-white/45">(c) 2026 VietSage. All rights reserved.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {cols.map((col) => (
            <div key={col.heading}>
              <h3 className="font-black text-[#f3c66b]">{col.heading}</h3>
              <div className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <Link key={link.label} href={link.href} className="block text-sm text-white/64 hover:text-white">{link.label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
