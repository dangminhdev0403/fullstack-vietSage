import { redirect } from "next/navigation";

import { VsIcon } from "../_components/vs-icon";
import {
  resolveSingleAssignedHotel,
  resolveWorkspacePersona,
} from "@/features/workspace/utils/workspace-context";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export const dynamic = "force-dynamic";

export default async function StaffEntryPage() {
  const context = await loadServerWorkspaceContext("/staff");
  const persona = resolveWorkspacePersona(context.activeRole.code);
  const assignedHotel = resolveSingleAssignedHotel(context);

  if (persona && persona !== "platform_admin" && persona !== "owner") {
    if (assignedHotel) {
      redirect(`/hotels/${encodeURIComponent(assignedHotel.id)}/dashboard`);
    }
  }

  const hasMultipleAssignments = context.accessibleHotels.length > 1;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-container-low)] px-4 py-8 sm:px-6">
      <section className="w-full max-w-xl rounded-2xl border border-[var(--outline-variant)] bg-white p-6 text-center sm:p-8" aria-labelledby="staff-assignment-title">
        <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-[var(--secondary-container)] text-[var(--primary)]">
          <VsIcon name={hasMultipleAssignments ? "warning" : "domain_disabled"} className="text-2xl" />
        </span>
        <h1 id="staff-assignment-title" className="vs-display mt-5 text-2xl font-bold leading-tight text-[var(--primary)] sm:text-3xl">
          {hasMultipleAssignments ? "Phân công cần được điều chỉnh" : "Chưa được phân công khách sạn"}
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--on-surface-variant)]">
          {hasMultipleAssignments
            ? "Tài khoản đang có nhiều hơn một khách sạn hoạt động. Chủ khách sạn cần chuyển nhân viên về đúng một nơi làm việc."
            : "Chủ khách sạn cần gán tài khoản này vào một khách sạn trước khi bắt đầu ca làm việc."}
        </p>
      </section>
    </main>
  );
}
