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
  title: "VietSage | Hospitality Technology Platform",
  description:
    "VietSage is a modern hospitality technology platform that helps hotels digitize operations, improve guest experiences, simplify management, support multilingual services, and scale with confidence.",
  openGraph: {
    title: "VietSage Hospitality Technology Platform",
    description:
      "A premium platform for hotel operations, guest experience, multilingual service, management visibility, and business growth.",
    images: ["/marketing/bay.jpg"],
  },
};

const solutions = [
  {
    title: "VietSage Hospitality",
    text: "Help hotels digitize daily operations, simplify guest service, improve team coordination, and gain clearer visibility across the property.",
  },
  {
    title: "VietSage Commerce",
    text: "A future service-commerce direction for businesses that want structured ordering, catalog management, customer journeys, and operational reporting.",
  },
  {
    title: "VietSage Health",
    text: "A future vertical exploring digital service journeys, scheduling visibility, multilingual support, and operational coordination for healthcare providers.",
  },
];

const why = [
  {
    title: "Guest Experience",
    text: "Give guests a smoother digital service journey with easier access, clearer communication, multilingual support, and faster follow-up.",
  },
  {
    title: "Hotel Operations",
    text: "Help teams coordinate guest requests, room activity, service delivery, and daily priorities through a clearer operating workflow.",
  },
  {
    title: "Multilingual",
    text: "Support international guests and staff communication with multilingual experiences and optional AI assistance for translation and response preparation.",
  },
  {
    title: "Operational Visibility",
    text: "View service activity, guest demand, team workload, business signals, and operational health from a management dashboard.",
  },
  {
    title: "Enterprise Security",
    text: "Support hotel owners, managers, and staff teams with role-based access and secure operating patterns for business environments.",
  },
  {
    title: "Scalable Platform",
    text: "Start with core hotel workflows, then expand into broader services, reporting, integrations, and multi-property growth.",
  },
];

const faqs = [
  [
    "Who is VietSage designed for?",
    "VietSage is designed for hotels and hospitality businesses that want to digitize operations, improve guest experiences, simplify management, and gain better operational visibility.",
  ],
  [
    "Can VietSage work alongside existing hotel systems?",
    "Yes. VietSage is designed to complement existing hotel systems by strengthening guest service workflows, multilingual experiences, reporting, and management visibility. It does not claim to replace a PMS.",
  ],
  [
    "Does VietSage support multiple languages?",
    "Yes. VietSage supports multilingual hospitality experiences, with AI used only as optional support for translation, automation, and operational insights.",
  ],
];
export default function Home() {
  return (
    <MarketingShell>
      <Hero
        eyebrow="Hospitality Technology Platform"
        title="Digitize hotel operations with a premium guest experience."
        text="VietSage helps hotels modernize daily operations, improve guest service journeys, support multilingual communication, simplify management, and create clearer visibility for business growth."
        image="/marketing/bay.jpg"
      >
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([v, l]) => (
            <div
              key={l}
              className="rounded-3xl border border-[#123d2a]/10 bg-white/70 p-4"
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
            Built for hospitality teams and business growth
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            <span className="vs-logo-tile">GUEST SERVICE</span>
            <span className="vs-logo-tile">OPERATIONS</span>
            <span className="vs-logo-tile">VISIBILITY</span>
            <span className="vs-logo-tile">GROWTH</span>
          </div>
        </div>
      </section>
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Platform overview"
            title="A company platform for modern hospitality operations."
            text="VietSage brings together digital guest service, operational workflows, multilingual communication, management dashboards, and business visibility in a practical hospitality platform."
          />
          <div className="mt-12">
            <CardGrid items={solutions} />
          </div>
        </div>
      </section>
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Why VietSage"
            title="Built for trust, speed, and global hospitality standards."
            text="VietSage is designed around operational clarity, guest convenience, secure access, multilingual service, and scalable growth for hospitality businesses."
          />
          <div className="mt-12">
            <CardGrid items={why} />
          </div>
        </div>
      </section>
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="rounded-[2rem] bg-[#123d2a] p-8 text-white">
            <p className="text-[#f3c66b]">Dashboard Preview</p>
            <h2 className="vs-display mt-3 text-5xl font-black">
              See the operational signals that shape each service day.
            </h2>
            <p className="mt-5 text-white/70">
              Management views, service activity, guest demand, team workload,
              and business signals help leaders understand where to focus.
            </p>
          </div>
          <CardGrid
            items={[
              {
                title: "Service coordination",
                text: "Teams can organize guest needs, follow-up work, and service priorities with clearer daily accountability.",
              },
              {
                title: "Digital guest journeys",
                text: "Hotels can provide guests with easier digital access to services, information, and multilingual support.",
              },
              {
                title: "Business visibility",
                text: "Operational and service data help managers identify demand patterns, workload pressure, and growth opportunities.",
              },
            ]}
          />
        </div>
      </section>
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Benefits"
            title="Designed for hospitality teams that need clarity and control."
            text="Core benefits VietSage is built to support for hotels and service-led businesses."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              "Bring guest service activity, staff follow-up, and management visibility into a more consistent workflow.",
              "Support international guests with a digital journey that feels clear, premium, and easy to use.",
              "Help owners and managers make decisions with better visibility into operations, demand, and service performance.",
            ].map((q, i) => (
              <blockquote
                key={q}
                className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-[#123d2a]/5"
              >
                <p className="text-lg leading-8 text-[#4d5b50]">{q}</p>
                <footer className="mt-5 font-black text-[#123d2a]">
                  Platform benefit {i + 1}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow="FAQ"
            title="Questions before a demo?"
            text="A concise overview for investors, hotel owners, and business customers evaluating VietSage."
          />
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="rounded-3xl bg-white/82 p-6">
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
