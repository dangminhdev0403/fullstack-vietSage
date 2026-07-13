import Link from "next/link";

import { VsIcon } from "./(vietsage)/_components/vs-icon";

const commonLinks = [
  {
    href: "/",
    label: "Trang chủ",
    desc: "Quay về trang chính để điều hướng lại",
    icon: "home",
  },
  {
    href: "/",
    label: "Về trang chính",
    desc: "Quay về trang chính để bắt đầu lại",
    icon: "arrow_forward",
  },
  {
    href: "/g/services",
    label: "Khám phá dịch vụ",
    desc: "Xem nhanh các tiện ích và dịch vụ đang có",
    icon: "concierge",
  },
] as const;

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[color:rgba(224,224,255,0.8)] blur-3xl" />
        <div className="absolute -right-20 bottom-12 h-80 w-80 rounded-full bg-[color:rgba(254,214,91,0.22)] blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full bg-[color:rgba(0,0,128,0.08)] blur-2xl" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16">
        <section className="w-full rounded-3xl border border-[color:rgba(198,197,213,0.45)] bg-[color:rgba(255,255,255,0.84)] p-8 shadow-[0_18px_45px_rgba(0,0,0,0.09)] backdrop-blur-xl md:p-12">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-[var(--primary-fixed)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-primary-fixed)]">
            <VsIcon name="info" className="text-sm" />
            Không tìm thấy trang
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="vs-display text-[84px] font-bold leading-[0.9] text-[var(--primary)] md:text-[112px]">404</p>
              <h1 className="vs-display mt-2 text-3xl font-semibold text-[var(--primary)] md:text-5xl">
                Trang bạn tìm không tồn tại
              </h1>
              <p className="mt-4 max-w-xl text-base leading-[1.65] text-[var(--on-surface-variant)] md:text-lg">
                Đường dẫn có thể đã thay đổi hoặc không còn hiệu lực. Bạn có thể quay lại trang chủ
                hoặc đi nhanh đến các trang phổ biến bên dưới.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--on-primary)] shadow-lg transition-transform hover:-translate-y-0.5"
                >
                  <VsIcon name="home" className="text-base" />
                  Về Trang chủ
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:rgba(0,0,60,0.2)] bg-white px-6 py-3 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)]"
                >
                  <VsIcon name="arrow_forward" className="text-base" />
                  Về trang chính
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              {commonLinks.map((item) => (
                <Link
                  key={`${item.href}:${item.label}`}
                  href={item.href}
                  className="group block rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-[var(--surface-container-low)] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:bg-white"
                >
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-fixed)] text-[var(--primary)]">
                    <VsIcon name={item.icon} className="text-[20px]" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--primary)]">{item.label}</p>
                  <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{item.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
