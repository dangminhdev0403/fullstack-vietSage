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

const FALLBACK_DOCUMENT_TYPES = [
  { code: "1", parentCode: null, nameVi: "Thẻ CCCD", nameEn: null, id: "DOCUMENT_TYPE::1", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "2", parentCode: null, nameVi: "Thẻ CMND", nameEn: null, id: "DOCUMENT_TYPE::2", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "8", parentCode: null, nameVi: "Thẻ Căn Cước", nameEn: null, id: "DOCUMENT_TYPE::8", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "4", parentCode: null, nameVi: "Hộ chiếu", nameEn: null, id: "DOCUMENT_TYPE::4", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "3", parentCode: null, nameVi: "Giấy phép lái xe", nameEn: null, id: "DOCUMENT_TYPE::3", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "5", parentCode: null, nameVi: "Giấy khai sinh", nameEn: null, id: "DOCUMENT_TYPE::5", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "6", parentCode: null, nameVi: "Thẻ BHYT", nameEn: null, id: "DOCUMENT_TYPE::6", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
  { code: "7", parentCode: null, nameVi: "Thông báo số định danh cá nhân", nameEn: null, id: "DOCUMENT_TYPE::7", kind: "DOCUMENT_TYPE", isActive: true, fetchedAt: "" },
];

const FALLBACK_NATIONALITIES = [
  { code: "VNM", parentCode: null, nameVi: "Việt Nam", nameEn: "Viet Nam", id: "NATIONALITY::VNM", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "KOR", parentCode: null, nameVi: "Hàn Quốc", nameEn: "Korea", id: "NATIONALITY::KOR", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "CHN", parentCode: null, nameVi: "Trung Quốc", nameEn: "China", id: "NATIONALITY::CHN", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "TWN", parentCode: null, nameVi: "Trung Quốc (Đài Loan)", nameEn: "Taiwan", id: "NATIONALITY::TWN", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "JPN", parentCode: null, nameVi: "Nhật Bản", nameEn: "Japan", id: "NATIONALITY::JPN", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "USA", parentCode: null, nameVi: "Hoa Kỳ", nameEn: "United States", id: "NATIONALITY::USA", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "GBR", parentCode: null, nameVi: "Vương quốc Anh", nameEn: "United Kingdom", id: "NATIONALITY::GBR", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "FRA", parentCode: null, nameVi: "Pháp", nameEn: "France", id: "NATIONALITY::FRA", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "DEU", parentCode: null, nameVi: "Đức", nameEn: "Germany", id: "NATIONALITY::DEU", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "RUS", parentCode: null, nameVi: "Nga", nameEn: "Russian Federation", id: "NATIONALITY::RUS", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "AUS", parentCode: null, nameVi: "Úc", nameEn: "Australia", id: "NATIONALITY::AUS", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "THA", parentCode: null, nameVi: "Thái Lan", nameEn: "Thailand", id: "NATIONALITY::THA", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "SGP", parentCode: null, nameVi: "Singapore", nameEn: "Singapore", id: "NATIONALITY::SGP", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "MYS", parentCode: null, nameVi: "Malaysia", nameEn: "Malaysia", id: "NATIONALITY::MYS", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "IDN", parentCode: null, nameVi: "Indonesia", nameEn: "Indonesia", id: "NATIONALITY::IDN", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
  { code: "IND", parentCode: null, nameVi: "Ấn Độ", nameEn: "India", id: "NATIONALITY::IND", kind: "NATIONALITY", isActive: true, fetchedAt: "" },
];

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
    if (parsed.data.kind === "DOCUMENT_TYPE") {
      return NextResponse.json(
        { status: 200, error: null, message: "OK", data: FALLBACK_DOCUMENT_TYPES },
        {
          headers: {
            "Cache-Control":
              "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
          },
        },
      );
    }
    if (parsed.data.kind === "NATIONALITY") {
      return NextResponse.json(
        { status: 200, error: null, message: "OK", data: FALLBACK_NATIONALITIES },
        {
          headers: {
            "Cache-Control":
              "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
          },
        },
      );
    }
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
