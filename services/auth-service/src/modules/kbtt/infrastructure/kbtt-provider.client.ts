import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import {
  kbttSessionSchema,
  type KbttCatalogKind,
  type KbttCredentials,
} from "../domain/schemas/kbtt.schema";
import { kbttUnavailable, loadKbttConfig } from "./kbtt.config";

export const KBTT_AUTH_FAILED_MESSAGE =
  "Không thể xác thực tài khoản KBTT. Kiểm tra tài khoản, quyền tích hợp hoặc thử lại sau.";

export type KbttSubmitOutcome =
  | { outcome: "SUCCESS"; code: string; message: string; data?: unknown }
  | { outcome: "BUSINESS_REJECTION"; code: string; message: string; data?: unknown }
  | { outcome: "AMBIGUOUS"; code: string; message: string; data?: unknown };

export function kbttAuthFailed() {
  return new HttpException({ code: "KBTT_AUTH_FAILED", message: KBTT_AUTH_FAILED_MESSAGE }, 422);
}

export function kbttProviderError(
  code: "KBTT_MISSING_AUTHORITY" | "KBTT_PROVIDER_UNAVAILABLE" | "KBTT_PROVIDER_INVALID_RESPONSE",
) {
  const messages = {
    KBTT_MISSING_AUTHORITY: "Tài khoản chưa được cấp quyền khai báo tạm trú.",
    KBTT_PROVIDER_UNAVAILABLE: "Không thể kết nối hệ thống Bộ Công an. Vui lòng thử lại.",
    KBTT_PROVIDER_INVALID_RESPONSE: "Hệ thống Bộ Công an trả về dữ liệu không hợp lệ.",
  } as const;
  return new HttpException(
    { code, message: messages[code] },
    code === "KBTT_MISSING_AUTHORITY" ? 422 : 502,
  );
}

@Injectable()
export class KbttProviderClient {
  private readonly config = loadKbttConfig();

  async login(credentials: KbttCredentials) {
    return this.session(
      await this.request(
        "token",
        "POST",
        new URLSearchParams({ ...credentials, "grant-type": "api_cslt" }),
      ),
    );
  }

  async refresh(refreshToken: string) {
    return this.session(
      await this.request("refresh-token", "POST", undefined, { refresh_token: refreshToken }),
    );
  }

  async revoke(accessToken: string) {
    await this.request("revoke", "DELETE", undefined, { access_token: accessToken });
  }

  async fetchCatalog(kind: KbttCatalogKind, parentCode?: string): Promise<unknown> {
    const paths: Record<KbttCatalogKind, string> = {
      NATIONALITY: "/cms-backend/public/dm-qt/3th/get-all",
      PROVINCE: "/cms-backend/public/dm-tinh-tp/get-all",
      WARD: "/cms-backend/public/dm-phuong-xa",
      STAY_REASON: "/cms-backend/public/ly-do-cu-tru/get-all",
      DOCUMENT_TYPE: "/cms-backend/public/loai-giay-to/get-all",
      RESIDENCE_PLACE: "/cms-backend/public/noi-cu-tru/get-all",
    };
    const path = paths[kind];
    const query: Record<string, string> = {};
    if (kind === "WARD") {
      if (!parentCode || !parentCode.trim()) {
        throw new BadRequestException(
          "Mã tỉnh/thành phố (trucThuocTinh) là bắt buộc để tải danh mục phường xã.",
        );
      }
      query.trucThuocTinh = parentCode.trim();
    }
    return this.requestPublic(path, query);
  }

  async submitDeclaration(
    declarationKind: "VIETNAMESE" | "FOREIGN",
    payload: unknown[],
    accessToken: string,
  ): Promise<KbttSubmitOutcome> {
    const path =
      declarationKind === "FOREIGN"
        ? "/client-service/kbtt/kbtt-3th"
        : "/client-service/kbtt-vn/kbtt-3th";
    if (!this.config.KBTT_BASE_URL) throw kbttUnavailable();
    const url = new URL(`${this.config.KBTT_BASE_URL}${path}`);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (networkError: any) {
      const isTimeout =
        networkError?.name === "TimeoutError" ||
        networkError?.name === "AbortError" ||
        String(networkError?.message).toLowerCase().includes("timeout");
      return {
        outcome: "AMBIGUOUS",
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: isTimeout
          ? "Quá thời gian chờ phản hồi từ cơ quan quản lý (10s)."
          : "Lỗi kết nối mạng khi gửi hồ sơ khai báo đến cơ quan quản lý.",
      };
    }

    if (!response.body) {
      return {
        outcome: "AMBIGUOUS",
        code: `HTTP_${response.status}`,
        message: "Cơ quan quản lý không trả về nội dung phản hồi.",
      };
    }

    try {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65_536) {
            return {
              outcome: "AMBIGUOUS",
              code: "RESPONSE_OVERSIZED",
              message: "Phản hồi từ cơ quan quản lý vượt quá dung lượng cho phép.",
            };
          }
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }

      const raw = Buffer.concat(chunks).toString("utf8");
      let envelope: any;
      try {
        envelope = JSON.parse(raw);
      } catch {
        return {
          outcome: "AMBIGUOUS",
          code: `HTTP_${response.status}`,
          message: "Phản hồi từ cơ quan quản lý không đúng định dạng JSON.",
        };
      }

      if (!envelope || typeof envelope !== "object" || !("code" in envelope)) {
        return {
          outcome: "AMBIGUOUS",
          code: `HTTP_${response.status}`,
          message: "Phản hồi không chứa mã kết quả hợp lệ.",
        };
      }

      const codeStr = String(envelope.code);
      const messageStr = typeof envelope.message === "string" ? envelope.message : "";

      if (response.ok && codeStr === "200") {
        return {
          outcome: "SUCCESS",
          code: "200",
          message: messageStr || "Thành công",
          data: envelope.data ?? null,
        };
      }

      if (response.status >= 500 || codeStr.startsWith("5")) {
        return {
          outcome: "AMBIGUOUS",
          code: codeStr,
          message: messageStr || "Hệ thống đối tác gặp sự cố nội bộ.",
          data: envelope.data ?? null,
        };
      }

      return {
        outcome: "BUSINESS_REJECTION",
        code: codeStr,
        message: messageStr || "Bị từ chối bởi cơ quan quản lý",
        data: envelope.data ?? null,
      };
    } catch {
      return {
        outcome: "AMBIGUOUS",
        code: "STREAM_READ_ERROR",
        message: "Lỗi trong quá trình nhận dữ liệu phản hồi từ cơ quan quản lý.",
      };
    }
  }

  private session(data: unknown) {
    const parsed = kbttSessionSchema.safeParse(data);
    if (!parsed.success) {
      const authorities =
        data && typeof data === "object" && "Authorities" in data ? data.Authorities : null;
      if (Array.isArray(authorities) && !authorities.includes("kbtt:create-3th"))
        throw kbttProviderError("KBTT_MISSING_AUTHORITY");
      throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
    }
    if (parsed.data.Exp * 1000 <= Date.now() + 60_000)
      throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
    return parsed.data;
  }

  private async request(
    path: string,
    method: string,
    body?: URLSearchParams,
    query?: Record<string, string>,
  ): Promise<unknown> {
    const basicAuth =
      path === "token"
        ? this.config.KBTT_LOGIN_BASIC_AUTH_VALUE
        : this.config.KBTT_TOKEN_BASIC_AUTH_VALUE;
    if (!basicAuth || !this.config.KBTT_BASE_URL) throw kbttUnavailable();
    const url = new URL(`${this.config.KBTT_BASE_URL}/authorization-service/oauth/${path}`);
    if (query) url.search = new URLSearchParams(query).toString();
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: "Basic " + basicAuth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw kbttProviderError("KBTT_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok || !response.body) throw kbttProviderError("KBTT_PROVIDER_UNAVAILABLE");
    try {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65_536) throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      const envelope: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        !envelope ||
        typeof envelope !== "object" ||
        !("code" in envelope) ||
        !("data" in envelope)
      )
        throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
      if (envelope.code !== "200") throw kbttAuthFailed();
      return envelope.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
    }
  }

  private async requestPublic(path: string, query?: Record<string, string>): Promise<unknown> {
    if (!this.config.KBTT_BASE_URL) throw kbttUnavailable();
    const url = new URL(`${this.config.KBTT_BASE_URL}${path}`);
    if (query && Object.keys(query).length > 0) {
      url.search = new URLSearchParams(query).toString();
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw kbttProviderError("KBTT_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok || !response.body) throw kbttProviderError("KBTT_PROVIDER_UNAVAILABLE");
    try {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      const MAX_CATALOG_SIZE = 5 * 1024 * 1024;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_CATALOG_SIZE) throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      const envelope: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        !envelope ||
        typeof envelope !== "object" ||
        !("code" in envelope) ||
        !("data" in envelope)
      ) {
        throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
      }
      if ((envelope as { code: unknown }).code !== "200") {
        throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
      }
      return (envelope as { data: unknown }).data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw kbttProviderError("KBTT_PROVIDER_INVALID_RESPONSE");
    }
  }
}
