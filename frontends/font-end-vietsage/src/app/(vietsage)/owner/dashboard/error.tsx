"use client";

export default function OwnerDashboardError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-[1.75rem] border border-[#d37a68]/40 bg-[#fff0ea] p-8 text-[#9b3f2f] shadow-[0_18px_60px_rgba(31,61,53,0.10)]">
      <p className="text-xs font-bold uppercase tracking-[0.22em]">Dashboard</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Không thể tải dashboard</h2>
      <p className="mt-3 max-w-2xl text-sm">Vui lòng thử lại. Nếu lỗi tiếp tục xảy ra, kiểm tra kết nối API hoặc quyền truy cập khách sạn.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-[#9b3f2f] px-5 py-3 text-sm font-bold text-white">
        Thử lại
      </button>
    </section>
  );
}
