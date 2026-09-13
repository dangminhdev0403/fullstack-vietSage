import Link from "next/link";
import { notFound } from "next/navigation";

import { KbttDeclarationsPage } from "@/features/kbtt/components/kbtt-declarations-page";
import { canUseHotelId } from "@/features/hotel-ops/utils/hotel-route-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

export const dynamic = "force-dynamic";

export default async function OwnerKbttPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = await params;
  const callbackUrl =
    `/owner/hotels/${encodeURIComponent(hotelId)}/kbtt` as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  if (!canUseHotelId(context, hotelId)) notFound();
  const canView = context.permissions.some((permission) =>
    ["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"].includes(
      permission,
    ),
  );
  if (!canView) notFound();
  const canManage = context.permissions.includes(
    "hotel.kbtt.declarations.manage",
  );
  const canConfigure = context.permissions.some((permission) =>
    ["hotel.kbtt.view", "hotel.kbtt.manage"].includes(permission),
  );

  return (
    <div className="space-y-4">
      {canConfigure && (
        <div className="flex justify-end">
          <Link
            href={`/owner/hotels/${encodeURIComponent(hotelId)}/kbtt/connection`}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cấu hình kết nối BCA
          </Link>
        </div>
      )}
      <KbttDeclarationsPage hotelId={hotelId} canManage={canManage} />
    </div>
  );
}
