import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { servicePortalClient } from "@/features/service-portal/service-client";

export async function GET(request: Request) {
  try {
    const file = new URL(request.url).searchParams.get("file");
    if (file === "sheet") {
      const data = await executeHotelOpsBackendRequest("service portal sheet", (token) => servicePortalClient.data(token));
      if (data instanceof Response) return data;
      const rawUrl = data.profile.googleSheetsUrl?.trim();
      if (!rawUrl) return validationErrorResponse("Chưa có URL Google Sheets / Excel Online nào được cấu hình cho đối tác");

      let csvExportUrl = rawUrl;
      const googleMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (googleMatch?.[1]) {
        const gidMatch = rawUrl.match(/[?&#]gid=([0-9]+)/);
        const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";
        csvExportUrl = `https://docs.google.com/spreadsheets/d/${googleMatch[1]}/export?format=csv${gidParam}`;
      } else if (rawUrl.includes("onedrive") || rawUrl.includes("sharepoint") || rawUrl.includes("office")) {
        csvExportUrl = rawUrl.includes("?") ? `${rawUrl}&download=1` : `${rawUrl}?download=1`;
      }

      const response = await fetch(csvExportUrl, { cache: "no-store" });
      if (!response.ok) return validationErrorResponse(`Không thể tải dữ liệu bảng tính từ link trực tuyến (Mã HTTP ${response.status}). Vui lòng kiểm tra lại quyền truy cập.`);
      const text = await response.text();
      if (!text || text.includes("<!DOCTYPE html") || text.includes("<html")) {
        return validationErrorResponse("Bảng tính Google Sheets / Excel Online chưa được mở quyền truy cập công khai. Vui lòng chọn 'Chia sẻ' -> 'Bất kỳ ai có liên kết'.");
      }
      return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    }
    if (file === "template" || file === "export") {
      const csv = await executeHotelOpsBackendRequest(`service portal ${file}`, (token) => file === "template" ? servicePortalClient.template(token) : servicePortalClient.export(token));
      if (csv instanceof Response) return csv;
      return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="service_items${file === "template" ? "_template" : ""}.csv"` } });
    }
    const data = await executeHotelOpsBackendRequest("service portal data", (token) => servicePortalClient.data(token));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null); if (!body || typeof body !== "object") return validationErrorResponse("Dữ liệu không hợp lệ");
  try { const data = await executeHotelOpsBackendRequest("update service profile", (token) => servicePortalClient.profile(token, body)); return data instanceof Response ? data : successResponse(data); }
  catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: string; code?: string; orderId?: string; toStatus?: string; input?: unknown; data?: unknown; csv?: string; fileName?: string; previewToken?: string; serviceId?: string } | null;
  if (!body) return validationErrorResponse("Dữ liệu không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("service portal mutation", (token) => {
      if (body.action === "ticket") return servicePortalClient.ticket(token);
      if (body.action === "verifyVoucher" && body.code) return servicePortalClient.verifyVoucher(token, body.code);
      if (body.action === "redeemVoucher" && body.code) return servicePortalClient.redeemVoucher(token, body.code);
      if (body.action === "transition" && body.orderId && body.toStatus) return servicePortalClient.transition(token, body.orderId, body.toStatus);
      if (body.action === "importPreview" && body.csv) return servicePortalClient.importPreview(token, body.csv, body.fileName ?? "service-items.csv");
      if (body.action === "importCommit" && body.csv && body.previewToken) return servicePortalClient.importCommit(token, body.csv, body.fileName ?? "service-items.csv", body.previewToken);
      if (body.action === "update" && body.serviceId) return servicePortalClient.update(token, body.serviceId, body.data);
      if (body.action === "create" && body.input && typeof body.input === "object") return servicePortalClient.create(token, body.input);
      throw new Error("Hành động không hợp lệ hoặc thiếu dữ liệu");
    });
    return data instanceof Response ? data : successResponse(data, 200);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
