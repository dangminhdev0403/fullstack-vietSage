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
      <header className="vs-page-header">
        <div>
        <h1 className="vs-display">
          Trung tâm quản trị VietSage
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--on-surface-variant)]">
          Không gian này chỉ dành cho cấu hình cấp nền tảng. Vận hành khách sạn, lễ tân và công
          việc nhân viên được tách sang workspace tương ứng.
        </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <span className="rounded-lg bg-[var(--primary-fixed)] px-4 py-2 text-[var(--on-primary-fixed)]">
            {context.activeRole.name}
          </span>
          <span className="rounded-lg bg-[var(--secondary-fixed)] px-4 py-2 text-[var(--on-secondary-fixed)]">
            {context.permissions.length} quyền đang hoạt động
          </span>
        </div>
      </header>

      <section>
        <div className="mb-5">
          <h2 className="vs-display text-3xl font-semibold tracking-[-0.03em] text-[#17201b]">
            Khu vực quản trị
          </h2>
          <p className="mt-2 text-base text-[var(--on-surface-variant)]">Các khu vực được cấp cho vai trò hiện tại.</p>
        </div>

        {availableModules.length > 0 ? (
          <div className="vs-module-grid">
            {availableModules.map((widget) => {
              if (!widget.href) return null;
              return (
                <Link
                  key={widget.key}
                  href={widget.href}
                  className="vs-module-link"
                >
                  <span className="vs-module-icon">
                    <VsIcon name={widget.icon} className="text-2xl" />
                  </span>
                  <div>
                  <h3>{widget.title}</h3>
                  <p className="text-sm leading-6">{widget.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
                    Mở khu vực
                    <VsIcon name="arrow_forward" />
                  </span>
                  </div>
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

