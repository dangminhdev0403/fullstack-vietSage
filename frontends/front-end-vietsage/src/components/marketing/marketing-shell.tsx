import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { auth } from "@/auth";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VietSageBrand } from "@/components/brand/vietsage-brand";
import { getLandingAction } from "@/features/auth/utils/landing-action";

import { MarketingHeader } from "./marketing-header";
import { REQUEST_DEMO_URL } from "./marketing-links";
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
type MarketingLocale = "en" | "vi";

export async function MarketingShell({ children, locale = "en" }: { children: ReactNode; locale?: MarketingLocale }) {
  const session = await auth();
  const accountAction = getLandingAction(session);

  return (
    <MarketingMotionRoot className="vs-mkt-shell min-h-screen text-[#132119]">
      <div className="vs-scene-backdrop" aria-hidden="true">
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="arrival" />
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="concierge" />
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="operations" />
        <span className="vs-scene-backdrop-layer" data-scene-backdrop="visibility" />
      </div>
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
      <MarketingHeader accountAction={accountAction} locale={locale} />
      <nav className="vs-scene-rail" aria-label={locale === "vi" ? "Danh mục điều hướng trang chủ" : "Landing page sections"}>
        <a href="#arrival" data-scene-link="arrival"><span>01</span><em>{locale === "vi" ? "Đón tiếp" : "Arrival"}</em></a>
        <a href="#concierge" data-scene-link="concierge"><span>02</span><em>{locale === "vi" ? "E-Concierge" : "Concierge"}</em></a>
        <a href="#operations" data-scene-link="operations"><span>03</span><em>{locale === "vi" ? "Vận hành" : "Operations"}</em></a>
        <a href="#visibility" data-scene-link="visibility"><span>04</span><em>{locale === "vi" ? "Minh bạch" : "Clarity"}</em></a>
      </nav>
      {children}
      <Footer locale={locale} />
    </MarketingMotionRoot>
  );
}

export function SectionHeader({ eyebrow, title, text, reveal = "fade" }: { eyebrow: string; title: string; text: string; reveal?: "fade" | "from-left" | "from-right" }) {
  return (
    <div className="vs-section-header mx-auto max-w-3xl text-center" data-reveal={reveal}>
      <p className="text-xs font-black uppercase tracking-[0.26em] text-[#b8872f]">{eyebrow}</p>
      <h2 className="vs-display mt-3 text-3xl font-black leading-[1.02] tracking-[-0.035em] text-[#123d2a] md:text-6xl md:leading-none md:tracking-[-0.04em] [text-wrap:balance]">{title}</h2>
      <p className="mt-5 text-lg leading-8 text-[#627064]">{text}</p>
    </div>
  );
}

export function Hero({
  eyebrow,
  title,
  text,
  children,
  locale = "en",
}: {
  eyebrow: string;
  title: string;
  text: string;
  image?: string;
  children?: ReactNode;
  locale?: MarketingLocale;
}) {
  const services = locale === "vi"
    ? [
        { icon: "/images/concierge/icon-amenities.png", title: "Khăn và tiện ích", text: "Khăn tắm, đồ dùng cá nhân, ..." },
        { icon: "/images/concierge/icon-dining.png", title: "Ăn uống tại phòng", text: "Room service, minibar, ..." },
        { icon: "/images/concierge/icon-cleaning.png", title: "Dọn phòng", text: "Dọn phòng, bổ sung vật dụng, ..." },
        { icon: "/images/concierge/icon-local.png", title: "Hỗ trợ địa phương", text: "Đặt xe, tour, thông tin khu vực, ..." },
      ]
    : [
        { icon: "/images/concierge/icon-amenities.png", title: "Towels & amenities", text: "Towels, personal care, ..." },
        { icon: "/images/concierge/icon-dining.png", title: "In-room dining", text: "Room service, minibar, ..." },
        { icon: "/images/concierge/icon-cleaning.png", title: "Housekeeping", text: "Room cleaning, replenishments, ..." },
        { icon: "/images/concierge/icon-local.png", title: "Local support", text: "Transport, tours, area guides, ..." },
      ];

  return (
    <section id="arrival" data-scene="arrival" className="vs-cinematic-scene vs-hero-scene relative overflow-hidden">
      <div className="vs-landing-grid absolute inset-0 opacity-70" />
      <div className="vs-landing-orb left-[6%] top-24 h-28 w-28 bg-[#d7a84d]/24" />
      <div className="vs-landing-orb bottom-14 right-[12%] h-40 w-40 bg-[#123d2a]/14 [animation-delay:1.4s]" />
      <div className="vs-scene-watermark" aria-hidden="true">SAGE</div>
      <div className="relative mx-auto grid min-h-[calc(100svh-5rem)] max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-20">
        <div className="vs-hero-copy">
          <p className="inline-flex rounded-full border border-[#b8872f]/20 bg-white/60 px-4 py-2 text-xs font-black uppercase tracking-[0.26em] text-[#9b6a1d] shadow-sm shadow-[#123d2a]/5">{eyebrow}</p>
          <h1 className={`vs-display mt-6 font-black leading-[.98] tracking-[-0.05em] text-[#123d2a] [text-wrap:balance] ${locale === "vi" ? "text-[clamp(2rem,5vw,3.75rem)] md:leading-[.96]" : "text-[clamp(2.15rem,10vw,2.5rem)] md:text-7xl md:leading-[.92] md:tracking-[-0.065em]"}`}>{title}</h1>
          <p className="mt-6 max-w-2xl text-xl leading-9 text-[#405446]">{text}</p>
          <p className="mt-4 max-w-xl rounded-2xl border border-[#123d2a]/10 bg-white/58 px-4 py-3 text-sm font-bold text-[#123d2a] shadow-sm shadow-[#123d2a]/5">
            {locale === "vi"
              ? "Khách quét mã QR tại phòng để gửi yêu cầu; hệ thống tự động chuyển tác vụ đến đúng bộ phận phụ trách."
              : "Guests scan a room QR, choose what they need, and your team receives a clean service task instantly."}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              className="vs-mkt-primary-btn whitespace-nowrap rounded-full bg-[#123d2a] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-[#123d2a]/20"
              href={REQUEST_DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {locale === "vi" ? "Đặt lịch demo" : "Book a room demo"}
            </a>
            <Link className="vs-mkt-secondary-btn whitespace-nowrap rounded-full border border-[#123d2a]/20 bg-white/76 px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#123d2a] shadow-sm" href="/g/home">{locale === "vi" ? "Xem trải nghiệm khách" : "View guest flow"}</Link>
          </div>
          {children}
        </div>
        <div className="vs-hero-device relative min-w-0" data-parallax>
          <div className="vs-device-float">
            <div className="vs-device-card overflow-hidden rounded-[2rem] border border-[#123d2a]/10 bg-white shadow-[0_28px_80px_rgba(18,61,42,0.16)]">
              {/* Header: Dark forest green with white brand circle & status pill */}
              <div className="relative overflow-hidden bg-[#163f2e] px-5 py-4 sm:px-6 sm:py-5">
                <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5 blur-xl" aria-hidden="true" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white p-2 shadow-sm">
                      <VietSageBrand variant="mark" className="h-7 w-7" markClassName="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-black leading-tight text-white">{locale === "vi" ? "VietSage Assistant" : "VietSage Assistant"}</h2>
                      <p className="mt-0.5 text-xs text-white/80">{locale === "vi" ? "Chọn nhu cầu của bạn, chúng tôi sẽ hỗ trợ ngay" : "Choose your request, our team will assist immediately"}</p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-[#255841] px-3 py-1.5 text-xs font-semibold text-[#a7f3d0]">
                    <span className="h-2 w-2 rounded-full bg-[#34d399]" aria-hidden="true" />
                    {locale === "vi" ? "Sẵn sàng phục vụ" : "Online"}
                  </span>
                </div>
              </div>

              {/* White body panel */}
              <div className="bg-white p-5 sm:p-6">
                <div>
                  <h3 className="text-lg font-black tracking-tight text-[#123d2a] sm:text-xl">
                    {locale === "vi" ? "Bạn cần gì để kỳ lưu trú thoải mái hơn?" : "What would make your stay more comfortable?"}
                  </h3>
                  <p className="mt-1 text-xs text-[#627064] sm:text-sm">
                    {locale === "vi" ? "Chọn dịch vụ bạn quan tâm bên dưới" : "Select the service you need below"}
                  </p>
                </div>

                {/* Prompt bar */}
                <Link
                  href="/g/home"
                  className="group mt-4 flex min-h-12 items-center gap-2.5 rounded-2xl border border-[#123d2a]/10 bg-[#f4f7f5] px-4 py-2.5 text-xs text-[#506355] transition-all hover:border-[#123d2a]/25 hover:bg-[#edf3ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] sm:text-sm"
                >
                  <img src="/images/concierge/icon-ai.png" alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
                  <span className="min-w-0 flex-1 truncate text-[#627064]">
                    {locale === "vi" ? "Ví dụ: Đặt bàn ăn, yêu cầu dọn phòng, hỏi thông tin địa phương..." : "E.g. Table reservation, housekeeping, local guide..."}
                  </span>
                  <VsIcon name="chevron_right" className="shrink-0 text-base text-[#8b9d91] transition-transform group-hover:translate-x-0.5" />
                </Link>

                {/* 2x2 Services Grid */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {services.map((service) => (
                    <Link
                      key={service.title}
                      href="/g/home"
                      className="group flex min-w-0 items-center justify-between gap-2.5 rounded-[1.25rem] border border-[#123d2a]/8 bg-[#fcfdfc] p-3 transition-all hover:border-[#123d2a]/20 hover:bg-[#f6f9f7] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8872f] sm:p-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img src={service.icon} alt="" className="h-11 w-11 shrink-0 rounded-xl object-contain" />
                        <div className="min-w-0">
                          <h4 className="whitespace-nowrap text-sm font-black text-[#123d2a] sm:text-[15px]">{service.title}</h4>
                          <p className="mt-0.5 truncate text-xs text-[#627064]">{service.text}</p>
                        </div>
                      </div>
                      <VsIcon name="arrow_forward" className="shrink-0 text-base text-[#123d2a]/35 transition-all group-hover:translate-x-0.5 group-hover:text-[#123d2a]" />
                    </Link>
                  ))}
                </div>

                {/* Bottom Experience Card */}
                <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#2f5e48] via-[#244f3b] to-[#1a3d2e] p-4 text-white shadow-md">
                  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/12 text-lg text-white">
                        <VietSageBrand variant="mark" className="h-6 w-6" markClassName="h-6 w-6" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-black text-white sm:text-base">
                          {locale === "vi" ? "Trải nghiệm nghỉ dưỡng trọn vẹn" : "A seamless hospitality experience"}
                        </h4>
                        <p className="mt-0.5 truncate text-xs text-white/80">
                          {locale === "vi" ? "Mọi nhu cầu của bạn, chúng tôi luôn sẵn sàng." : "Whatever you need, our team is always ready."}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-white/15 bg-white/15 px-3.5 py-2 backdrop-blur-md">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white">
                        <VsIcon name="concierge" className="text-base" />
                      </span>
                      <div className="text-left">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75 leading-none">
                          {locale === "vi" ? "Phản hồi trong" : "Response in"}
                        </p>
                        <p className="mt-1 text-base font-black text-white leading-none">
                          {locale === "vi" ? "3 phút" : "3 mins"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <a className="vs-scroll-cue" href="#concierge" aria-label={locale === "vi" ? "Cuộn đến phần E-Concierge" : "Scroll to concierge section"}>
        <span>{locale === "vi" ? "Khám phá giải pháp" : "Explore the stay"}</span><i aria-hidden="true" />
      </a>
    </section>
  );
}

export function CardGrid({ items, reveal = "scale" }: { items: CardItem[]; reveal?: "scale" | "from-left" | "from-right" }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <article key={item.title} data-reveal={reveal} data-reveal-order={index % 3} className="vs-mkt-card rounded-[1.7rem] border border-[#123d2a]/10 bg-white/78 p-6 shadow-xl shadow-[#123d2a]/6">
          <div className="mb-5 h-2 w-16 rounded-full bg-[#d7a84d]" />
          <h3 className="text-2xl font-black text-[#123d2a]">{item.title}</h3>
          <p className="mt-3 leading-7 text-[#627064]">{item.text}</p>
        </article>
      ))}
    </div>
  );
}

export function CTA({ locale = "en" }: { locale?: MarketingLocale } = {}) {
  return (
    <section className="px-5 py-16 lg:px-8">
      <div data-reveal="cta" className="vs-cta-panel relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#123d2a] p-8 text-white shadow-2xl shadow-[#123d2a]/20 md:p-12">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f3c66b]">{locale === "vi" ? "Sẵn sàng chuyển đổi số vận hành khách sạn?" : "Ready for modern hospitality operations?"}</p>
            <h2 className="vs-display mt-3 text-2xl font-black leading-tight sm:text-3xl md:text-4xl lg:text-[2.4rem] xl:text-[2.75rem] 2xl:text-5xl xl:whitespace-nowrap">
              {locale === "vi" ? "Khởi động lộ trình triển khai cùng VietSage." : "Design your VietSage rollout."}
            </h2>
            <p className="mt-4 max-w-2xl text-white/72">{locale === "vi" ? "Trao đổi cùng chuyên gia VietSage về tối ưu vận hành, trải nghiệm số cho khách lưu trú, hỗ trợ đa ngôn ngữ và giải pháp tích hợp PMS an toàn, hiệu quả." : "Talk with our team about hotel operations, guest journeys, multilingual services, integrations, and secure deployment models."}</p>
          </div>
          <a
            href={REQUEST_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#f3c66b] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#123d2a]"
          >
            {locale === "vi" ? "Yêu cầu demo" : "Request Demo"}
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer({ locale }: { locale: MarketingLocale }) {
  const cols = locale === "vi" ? [
    { heading: "Công ty", links: [{ label: "Về chúng tôi", href: "/about" }, { label: "Liên hệ", href: "/contact" }, { label: "Doanh nghiệp (B2B)", href: "/b2b" }] },
    { heading: "Giải pháp", links: [{ label: "VietSage Hotel", href: "/" }, { label: "VietSage Commerce", href: "/commerce" }, { label: "VietSage Health", href: "/health" }] },
    { heading: "Tài nguyên", links: [{ label: "Blog", href: "/blog" }, { label: "Chính sách bảo mật", href: "#" }, { label: "Điều khoản sử dụng", href: "#" }] },
  ] : [
    { heading: "Company", links: [{ label: "About Us", href: "/about" }, { label: "Contact", href: "/contact" }, { label: "B2B", href: "/b2b" }] },
    { heading: "Solutions", links: [{ label: "VietSage Hotel", href: "/" }, { label: "VietSage Commerce", href: "/commerce" }, { label: "VietSage Health", href: "/health" }] },
    { heading: "Resources", links: [{ label: "Blog", href: "/blog" }, { label: "Privacy Policy", href: "#" }, { label: "Terms", href: "#" }] },
  ];
  return (
    <footer className="border-t border-[#123d2a]/10 bg-[#10251a] px-5 py-12 text-white lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_2fr]">
        <div>
          <VietSageBrand
            variant="wordmark"
            className="rounded-xl px-3 py-2"
            wordmarkClassName="h-7 w-auto"
          />
          <p className="mt-4 max-w-sm text-white/65">{locale === "vi" ? "Nền tảng công nghệ tiên phong cho vận hành khách sạn, thương mại dịch vụ và y tế số." : "Premium technology platforms for hospitality operations, service commerce, and future healthcare workflows."}</p>
          <p className="mt-6 text-sm text-white/45">{locale === "vi" ? "© 2026 VietSage. Bảo lưu mọi quyền." : "(c) 2026 VietSage. All rights reserved."}</p>
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
