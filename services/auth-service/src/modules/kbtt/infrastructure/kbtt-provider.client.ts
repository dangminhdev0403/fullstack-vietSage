import { HttpException, Injectable } from "@nestjs/common";
import { kbttSessionSchema, type KbttCredentials } from "../domain/schemas/kbtt.schema";
import { kbttUnavailable, loadKbttConfig } from "./kbtt.config";

export const KBTT_AUTH_FAILED_MESSAGE =
  "Không thể xác thực tài khoản KBTT. Kiểm tra tài khoản, quyền tích hợp hoặc thử lại sau.";

export function kbttAuthFailed() {
  return new HttpException({ code: "KBTT_AUTH_FAILED", message: KBTT_AUTH_FAILED_MESSAGE }, 422);
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
    if (!parsed.success || parsed.data.Exp * 1000 <= Date.now() + 60_000) throw kbttAuthFailed();
    return parsed.data;
  }

  private async request(
    path: string,
    method: string,
    body?: URLSearchParams,
    query?: Record<string, string>,
  ): Promise<unknown> {
    if (!this.config.KBTT_BASIC_AUTH_VALUE) throw kbttUnavailable();
    const url = new URL("https://api-tbltkbtt.bocongan.gov.vn/authorization-service/oauth/" + path);
    if (query) url.search = new URLSearchParams(query).toString();
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: "Basic " + this.config.KBTT_BASIC_AUTH_VALUE,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok || !response.body) throw kbttAuthFailed();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65_536) throw kbttAuthFailed();
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
        envelope.code !== "200" ||
        !("data" in envelope)
      )
        throw kbttAuthFailed();
      return envelope.data;
    } catch {
      throw kbttAuthFailed();
    }
  }
}
