import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { VsIcon } from "../../_components/vs-icon";
import {
  getWorkspaceDashboardWidgets,
} from "@/features/workspace/config/workspace-registry";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

type DashboardPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const rawTab = resolvedSearchParams.tab;
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const normalizedTab = typeof tab === "string" ? tab.trim().toLowerCase() : "";

  if (["permissions", "roles"].includes(normalizedTab)) redirect("/admin/roles");
  if (normalizedTab === "users") redirect("/admin/users");
  if (normalizedTab === "hotels") redirect("/admin/hotels");

  const callbackUrl = "/admin/dashboard" as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (persona !== "platform_admin") notFound();

  const availableModules = getWorkspaceDashboardWidgets({
    persona,
    permissions: context.permissions,
  });

  return (
    <>
      <header className="rounded-[2rem] border border-[#24473d]/10 bg-[#fffaf0]/85 p-6 shadow-[0_22px_70px_rgba(31,61,53,0.10)] md:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#bf7836]">
          Platform administration
        </p>
        <h1 className="vs-display mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#17201b] md:text-5xl">
          Trung tâm quản trị VietSage
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">
          Không gian này chỉ dành cho cấu hình cấp nền tảng. Vận hành khách sạn, lễ tân và công
          việc nhân viên được tách sang workspace tương ứng.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
          <span className="rounded-full bg-[#24473d] px-4 py-2 text-[#fff8e8]">
            {context.activeRole.name}
          </span>
          <span className="rounded-full bg-[#eadfce] px-4 py-2 text-[#5d3b1f]">
            {context.permissions.length} capability đang hoạt động
          </span>
        </div>
      </header>

      <section>
        <div className="mb-5">
          <h2 className="vs-display text-3xl font-semibold tracking-[-0.03em] text-[#17201b]">
            Khu vực quản trị
          </h2>
          <p className="mt-1 text-sm text-[#6d756e]">Chỉ hiển thị module được cấp cho role hiện tại.</p>
        </div>

        {availableModules.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {availableModules.map((widget) => {
              if (!widget.href) return null;
              return (
                <Link
                  key={widget.key}
                  href={widget.href}
                  className="group rounded-[1.75rem] border border-[#24473d]/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(31,61,53,0.08)] transition-transform hover:-translate-y-1"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#e6efe9] text-[#24473d]">
                    <VsIcon name={widget.icon} className="text-2xl" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[#17201b]">{widget.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6d756e]">{widget.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#bf7836]">
                    Mở module
                    <VsIcon name="arrow_forward" className="transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[#24473d]/20 bg-white/60 p-8 text-sm text-[#5f6b63]">
            Role hiện tại chưa có capability quản trị module nền tảng.
          </div>
        )}
      </section>
    </>
  );
}

