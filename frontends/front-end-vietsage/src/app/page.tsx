import {
  CardGrid,
  CTA,
  Hero,
  MarketingShell,
  SectionHeader,
  stats,
} from "@/components/marketing/marketing-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VietSage | In-room Concierge Platform",
  description:
    "VietSage helps hotels deliver in-room digital concierge, room service requests, multilingual support, and smoother guest comfort journeys without replacing the PMS.",
  openGraph: {
    title: "VietSage In-room Concierge Platform",
    description:
      "A premium digital concierge layer for in-room requests, amenities, service routing, multilingual support, and better guest comfort.",
    images: ["/brand/register-hero.png"],
  },
};

const solutions = [
  {
    title: "Room concierge by QR",
    text: "Guests scan in the room and request towels, amenities, housekeeping, dining, transport, or local help without downloading an app.",
  },
  {
    title: "Service routing for staff",
    text: "Each request reaches the right team with room context, priority, language support, and a simple status flow from received to completed.",
  },
  {
    title: "Comfort-focused guest journey",
    text: "The experience feels like a quiet digital front desk inside the room: helpful, premium, multilingual, and available exactly when guests need it.",
  },
];

const why = [
  {
    title: "Not hotel CRM",
    text: "VietSage is not centered on managing guest profiles or marketing campaigns; it is built for active service moments during the stay.",
  },
  {
    title: "Less friction at reception",
    text: "Routine questions and requests move from phone calls or lobby queues into a clear guest self-service flow inside the room.",
  },
  {
    title: "More comfortable stays",
    text: "Guests can ask for what they need privately and quickly, while staff receive structured information instead of scattered messages.",
  },
  {
    title: "Multilingual service",
    text: "International guests can understand services and submit requests more confidently, helping teams respond with fewer misunderstandings.",
  },
  {
    title: "Operational visibility",
    text: "Owners and managers see request volume, service speed, guest demand, and team workload without turning the guest journey into a back-office CRM.",
  },
  {
    title: "Works beside PMS",
    text: "VietSage complements existing hotel systems by adding a guest-facing service layer for convenience, comfort, and better in-room hospitality.",
  },
];

const moments = [
  "A guest needs extra towels after check-in and sends the request from the room QR.",
  "A family orders in-room dining without calling reception during the evening rush.",
  "A foreign guest asks for checkout guidance in their language and receives clear next steps.",
];

const faqs = [
  [
    "Is VietSage a CRM or PMS replacement?",
    "No. VietSage is a guest-facing service and in-room concierge layer. It helps hotels improve comfort, service access, multilingual support, and operational follow-up during the stay.",
  ],
  [
    "Do guests need to install an app?",
    "No. The intended flow is simple QR access from the room, so guests can request services quickly without app download friction.",
  ],
  [
    "What does the hotel team receive?",
    "The team receives structured room requests, service categories, statuses, and context so staff can coordinate more clearly and respond faster.",
  ],
];

export default function Home() {
  return (
    <MarketingShell>
      <Hero
        eyebrow="Digital front desk inside every room"
        title="Bring reception, room service, and guest comfort into one calm in-room flow."
        text="VietSage gives hotel guests a premium QR concierge for amenities, dining, housekeeping, local help, and multilingual support while giving staff a clearer way to route and complete every request."
      >
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([v, l]) => (
            <div
              key={l}
              className="vs-mkt-card rounded-3xl border border-[#123d2a]/10 bg-white/70 p-4 shadow-sm shadow-[#123d2a]/5"
            >
              <strong className="text-3xl text-[#123d2a]">{v}</strong>
              <span className="block text-xs uppercase tracking-[.14em] text-[#627064]">
                {l}
              </span>
            </div>
          ))}
        </div>
      </Hero>

      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-center text-xs font-black uppercase tracking-[.28em] text-[#b8872f]">
            Guest comfort, not guest database management
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            <span className="vs-logo-tile">IN-ROOM QR</span>
            <span className="vs-logo-tile">AMENITIES</span>
            <span className="vs-logo-tile">ROOM SERVICE</span>
            <span className="vs-logo-tile">LOCAL HELP</span>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="What VietSage adds"
            title="A hospitality layer for the moments guests actually feel."
            text="Instead of focusing on CRM-style customer management, VietSage focuses on the in-stay experience: what guests need now, who should handle it, and how smoothly the hotel can deliver."
          />
          <div className="mt-12">
            <CardGrid items={solutions} />
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[2rem] bg-[#123d2a] p-8 text-white shadow-2xl shadow-[#123d2a]/18">
            <p className="text-[#f3c66b]">From room to team</p>
            <h2 className="vs-display mt-3 text-5xl font-black tracking-[-0.04em]">
              Every small request becomes a clear service signal.
            </h2>
            <p className="mt-5 text-white/72">
              The goal is not to copy a CRM page. The product direction is a quiet,
              premium service layer that helps guests feel cared for without making
              staff manage chaotic phone calls and chat threads.
            </p>
          </div>
          <div className="grid gap-4">
            {moments.map((moment, index) => (
              <article
                key={moment}
                className="vs-landing-reveal rounded-[1.8rem] border border-[#123d2a]/10 bg-white/80 p-6 shadow-xl shadow-[#123d2a]/6"
              >
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#b8872f]">
                  Stay moment {index + 1}
                </span>
                <p className="mt-3 text-xl font-black leading-8 text-[#123d2a]">
                  {moment}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Why this matters"
            title="Less lobby friction. More in-room convenience. Better service rhythm."
            text="Hotels can keep their existing management stack while adding a guest-facing experience that improves comfort, convenience, and staff coordination."
          />
          <div className="mt-12">
            <CardGrid items={why} />
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow="FAQ"
            title="Clear positioning before a demo."
            text="VietSage is designed around in-room hospitality and service delivery, not cloning a customer-care CRM narrative."
          />
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="rounded-3xl bg-white/82 p-6 shadow-sm shadow-[#123d2a]/5">
                <summary className="cursor-pointer font-black text-[#123d2a]">
                  {q}
                </summary>
                <p className="mt-3 leading-7 text-[#627064]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <CTA />
    </MarketingShell>
  );
}
