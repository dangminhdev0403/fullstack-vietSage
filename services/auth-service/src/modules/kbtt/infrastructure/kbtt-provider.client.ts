import { HttpException, Injectable } from "@nestjs/common";
import { kbttSessionSchema, type KbttCredentials } from "../domain/schemas/kbtt.schema";
import { kbttUnavailable, loadKbttConfig } from "./kbtt.config";

export const KBTT_AUTH_FAILED_MESSAGE =
  "Không thể xác thực tài khoản KBTT. Kiểm tra tài khoản, quyền tích hợp hoặc thử lại sau.";

export function kbttAuthFailed() {
  return new HttpException({ code: "KBTT_AUTH_FAILED", message: KBTT_AUTH_FAILED_MESSAGE }, 422);
}

function kbttProviderError(
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
}
