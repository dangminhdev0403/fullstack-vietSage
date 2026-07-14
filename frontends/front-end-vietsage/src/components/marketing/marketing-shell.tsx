import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { MarketingHeader } from "./marketing-header";
import { MarketingMotionRoot } from "./marketing-motion-root";

const sceneParticles = Array.from({ length: 18 }, (_, index) => ({
  left: `${7 + ((index * 29) % 88)}%`,
  top: `${8 + ((index * 37) % 84)}%`,
  size: `${2 + (index % 4)}px`,
  drift: `${18 + (index % 5) * 5}s`,
  delay: `${-2 - index * 1.35}s`,
  distance: `${28 + (index % 6) * 9}px`,
}));

export const stats = [
  ["24/7", "in-room concierge"],
  ["QR", "no app required"],
  ["Live", "service routing"],
  ["Multi", "guest languages"],
];

type CardItem = { title: string; text: string };

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <MarketingMotionRoot className="vs-mkt-shell min-h-screen text-[#132119]">
      <div className="vs-scene-backdrop" aria-hidden="true" />
      <div className="vs-scene-particles" aria-hidden="true">
        {sceneParticles.map((particle, index) => (
          <span
            key={index}
            style={
              {
                "--particle-left": particle.left,
                "--particle-top": particle.top,
                "--particle-size": particle.size,
                "--particle-drift": particle.drift,
                "--particle-delay": particle.delay,
                "--particle-distance": particle.distance,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="vs-scroll-progress" aria-hidden="true" />
      <MarketingHeader />
      <nav className="vs-scene-rail" aria-label="Landing page sections">
        <a href="#arrival" data-scene-link="arrival"><span>01</span><em>Arrival</em></a>
        <a href="#concierge" data-scene-link="concierge"><span>02</span><em>Concierge</em></a>
        <a href="#operations" data-scene-link="operations"><span>03</span><em>Operations</em></a>
        <a href="#visibility" data-scene-link="visibility"><span>04</span><em>Clarity</em></a>
      </nav>
      {children}
      <Footer />
    </MarketingMotionRoot>
  );
}

export function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="vs-section-header mx-auto max-w-3xl text-center" data-reveal>
      <p className="text-xs font-black uppercase tracking-[0.26em] text-[#b8872f]">{eyebrow}</p>
      <h2 className="vs-display mt-3 text-4xl font-black tracking-[-0.04em] text-[#123d2a] md:text-6xl">{title}</h2>
      <p className="mt-5 text-lg leading-8 text-[#627064]">{text}</p>
    </div>
  );
}

export function Hero({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; image?: string; children?: ReactNode }) {
  return (
    <section id="arrival" data-scene="arrival" className="vs-cinematic-scene vs-hero-scene relative overflow-hidden">
      <div className="vs-landing-grid absolute inset-0 opacity-70" />
      <div className="vs-landing-orb left-[6%] top-24 h-28 w-28 bg-[#d7a84d]/24" />
      <div className="vs-landing-orb bottom-14 right-[12%] h-40 w-40 bg-[#123d2a]/14 [animation-delay:1.4s]" />
      <div className="vs-scene-watermark" aria-hidden="true">SAGE</div>
      <div className="relative mx-auto grid min-h-[calc(100svh-5rem)] max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-20">
        <div className="vs-hero-copy">
          <p className="inline-flex rounded-full border border-[#b8872f]/20 bg-white/60 px-4 py-2 text-xs font-black uppercase tracking-[0.26em] text-[#9b6a1d] shadow-sm shadow-[#123d2a]/5">{eyebrow}</p>
          <h1 className="vs-display mt-6 text-5xl font-black leading-[.92] tracking-[-0.065em] text-[#123d2a] md:text-7xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-xl leading-9 text-[#405446]">{text}</p>
          <p className="mt-4 max-w-xl rounded-2xl border border-[#123d2a]/10 bg-white/58 px-4 py-3 text-sm font-bold text-[#123d2a] shadow-sm shadow-[#123d2a]/5">
            Guests scan a room QR, choose what they need, and your team receives a clean service task instantly.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="vs-mkt-primary-btn rounded-full bg-[#123d2a] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-[#123d2a]/20" href="/contact">Book a room demo</Link>
            <Link className="vs-mkt-secondary-btn rounded-full border border-[#123d2a]/20 bg-white/76 px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#123d2a] shadow-sm" href="/g/home">View guest flow</Link>
          </div>
          {children}
        </div>
        <div className="vs-hero-device relative" data-parallax>
          <div className="vs-hero-note vs-hero-note-left absolute -left-3 -top-4 z-10 hidden rounded-3xl border border-white/70 bg-white/90 p-4 shadow-2xl shadow-[#123d2a]/12 md:block">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9b6a1d]">Room 1208</p>
            <p className="mt-1 text-sm font-black text-[#123d2a]">Pillow request routed</p>
          </div>
          <div className="vs-hero-note vs-hero-note-right absolute -right-2 bottom-8 z-10 hidden max-w-[220px] rounded-3xl bg-[#123d2a] p-4 text-white shadow-2xl shadow-[#123d2a]/20 md:block">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#f3c66b]">Guest comfort</p>
            <p className="mt-1 text-sm text-white/80">No call, no app, no waiting line.</p>
          </div>
          <div className="vs-device-float">
            <div className="vs-device-card overflow-hidden rounded-[2.2rem] border border-white/70 bg-[#123d2a] p-4 shadow-2xl shadow-[#123d2a]/18">
            <div className="rounded-[1.7rem] bg-[#f8f1df] p-4">
              <div className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-lg shadow-[#123d2a]/6">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#b8872f]">VietSage Room Concierge</p>
                  <h3 className="mt-2 text-2xl font-black text-[#123d2a]">How can we make your stay more comfortable?</h3>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#123d2a] text-xl text-white">VS</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {["Towels & amenities", "In-room dining", "Housekeeping", "Local assistance"].map((item) => (
                  <div key={item} className="vs-service-tile rounded-3xl border border-[#123d2a]/10 bg-white/82 p-4">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-[#b8872f]">Request</span>
                    <p className="mt-2 font-black text-[#123d2a]">{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-3xl bg-[#123d2a] p-5 text-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f3c66b]">Live service desk</p>
                    <p className="mt-2 text-sm text-white/72">Guest request translated, assigned, and tracked by the hotel team.</p>
                  </div>
                  <strong className="text-4xl text-[#f3c66b]">3m</strong>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
      <a className="vs-scroll-cue" href="#concierge" aria-label="Scroll to concierge section">
        <span>Explore the stay</span><i aria-hidden="true" />
      </a>
    </section>
  );
}

export function CardGrid({ items }: { items: CardItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <article key={item.title} data-reveal data-reveal-order={index % 3} className="vs-mkt-card rounded-[1.7rem] border border-[#123d2a]/10 bg-white/78 p-6 shadow-xl shadow-[#123d2a]/6">
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
      <div data-reveal className="vs-cta-panel relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#123d2a] p-8 text-white shadow-2xl shadow-[#123d2a]/20 md:p-12">
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
