import { NextResponse } from "next/server";
import { z } from "zod";

import { getKbttPublicCatalog } from "@/features/kbtt/kbtt-public-catalog.server";
import { kbttCatalogKindSchema } from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ kind: kbttCatalogKindSchema });
const parentCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/);

type RouteContext = { params: Promise<{ kind: string }> };

export async function GET(request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: 400,
        message: "VALIDATION_ERROR",
        data: { detail: "Danh mục không hợp lệ." },
      },
      { status: 400 },
    );
  }

  const rawParentCode = new URL(request.url).searchParams.get("parentCode");
  const parentCode = rawParentCode
    ? parentCodeSchema.safeParse(rawParentCode)
    : null;
  if (rawParentCode && !parentCode?.success) {
    return NextResponse.json(
      {
        status: 400,
        message: "VALIDATION_ERROR",
        data: { detail: "Mã tỉnh không hợp lệ." },
      },
      { status: 400 },
    );
  }
  if (parsed.data.kind === "WARD" && !parentCode?.success) {
    return NextResponse.json(
      {
        status: 400,
        message: "VALIDATION_ERROR",
        data: { detail: "Mã tỉnh là bắt buộc." },
      },
      { status: 400 },
    );
  }

  try {
    const data = await getKbttPublicCatalog(
      parsed.data.kind,
      parentCode?.success ? parentCode.data : undefined,
    );
    return NextResponse.json(
      { status: 200, error: null, message: "OK", data },
      {
        headers: {
          "Cache-Control":
            "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        status: 502,
        message: "KBTT_PROVIDER_UNAVAILABLE",
        data: { detail: "Không thể tải danh mục Bộ Công an." },
      },
      { status: 502 },
    );
  }
}
