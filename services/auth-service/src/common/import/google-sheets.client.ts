import { BadRequestException } from "@nestjs/common";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const GOOGLE_SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const GOOGLE_SHEETS_READWRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type ServiceAccountCredentials = {
  type?: string;
  client_email?: string;
  private_key?: string;
  private_key_id?: string;
  token_uri?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
};

type CachedAccessToken = {
  token: string;
  expiresAtMs: number;
};

const tokenCache = new Map<string, CachedAccessToken>();

export class GoogleSheetsApiError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleSheetsApiError";
    this.status = status;
    this.code = status;
  }
}

export function clearGoogleSheetsTokenCache(): void {
  tokenCache.clear();
}

export async function getSpreadsheetSheetTitles(
  spreadsheetId: string,
  scopes: string[] = [GOOGLE_SHEETS_READONLY_SCOPE],
): Promise<string[]> {
  const accessToken = await getGoogleAccessToken(scopes);
  const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent("sheets.properties(index,title)")}`;
  const data = await googleJsonRequest<{
    sheets?: Array<{ properties?: { index?: number; title?: string } }>;
  }>(url, accessToken);

  return (data.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties): properties is NonNullable<typeof properties> => Boolean(properties))
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((properties) => properties.title ?? "");
}

export async function getSpreadsheetValues(
  spreadsheetId: string,
  range: string,
  scopes: string[] = [GOOGLE_SHEETS_READONLY_SCOPE],
): Promise<unknown[][]> {
  const accessToken = await getGoogleAccessToken(scopes);
  const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const data = await googleJsonRequest<{ values?: unknown[][] }>(url, accessToken);
  return data.values ?? [];
}

export async function batchGetSpreadsheetValues(
  spreadsheetId: string,
  ranges: string[],
  scopes: string[] = [GOOGLE_SHEETS_READONLY_SCOPE],
): Promise<Array<{ values?: unknown[][] }>> {
  const accessToken = await getGoogleAccessToken(scopes);
  const params = new URLSearchParams();
  for (const range of ranges) {
    params.append("ranges", range);
  }
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`;
  const data = await googleJsonRequest<{
    valueRanges?: Array<{ values?: unknown[][] }>;
  }>(url, accessToken);
  return data.valueRanges ?? [];
}

export async function batchUpdateSpreadsheetValues(
  spreadsheetId: string,
  data: Array<{ range: string; values: unknown[][] }>,
  scopes: string[] = [GOOGLE_SHEETS_READWRITE_SCOPE],
): Promise<void> {
  const accessToken = await getGoogleAccessToken(scopes);
  const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  await googleJsonRequest(url, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data,
    }),
  });
}

async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credentialsPath) {
    throw new BadRequestException("Máy chủ chưa cấu hình tài khoản dịch vụ Google Sheets");
  }

  const raw = await readFile(path.resolve(credentialsPath), "utf8");
  const credentials = JSON.parse(raw) as ServiceAccountCredentials;
  const credentialDigest = crypto.createHash("sha256").update(raw).digest("hex");
  const scopeKey = [...scopes].sort().join(" ");
  const cacheKey = `${credentialDigest}::${scopeKey}`;

  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return cached.token;
  }

  const tokenUri = credentials.token_uri?.trim() || DEFAULT_TOKEN_URI;
  const formBody = buildOAuthFormBody(credentials, scopeKey, tokenUri);
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const message = await extractGoogleErrorMessage(response);
    throw new GoogleSheetsApiError(response.status, message);
  }

  const tokenPayload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenPayload.access_token) {
    throw new GoogleSheetsApiError(502, "Google OAuth response did not include an access_token");
  }

  const expiresInMs = Math.max(0, (tokenPayload.expires_in ?? 3600) * 1000);
  tokenCache.set(cacheKey, {
    token: tokenPayload.access_token,
    expiresAtMs: Date.now() + expiresInMs,
  });
  return tokenPayload.access_token;
}

function buildOAuthFormBody(
  credentials: ServiceAccountCredentials,
  scopeKey: string,
  tokenUri: string,
): URLSearchParams {
  if (
    credentials.type === "service_account" ||
    (credentials.client_email && credentials.private_key)
  ) {
    if (!credentials.client_email || !credentials.private_key) {
      throw new BadRequestException("Tệp thông tin xác thực Google Sheets thiếu thông tin dịch vụ");
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const header = {
      alg: "RS256",
      typ: "JWT",
      ...(credentials.private_key_id ? { kid: credentials.private_key_id } : {}),
    };
    const payload = {
      iss: credentials.client_email,
      scope: scopeKey,
      aud: tokenUri,
      exp: nowSec + 3600,
      iat: nowSec,
    };
    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(signingInput)
      .sign(credentials.private_key, "base64url");

    return new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signature}`,
    });
  }

  if (
    credentials.type === "authorized_user" &&
    credentials.client_id &&
    credentials.client_secret &&
    credentials.refresh_token
  ) {
    return new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
    });
  }

  throw new BadRequestException("Định dạng tệp xác thực Google Sheets không được hỗ trợ");
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function googleJsonRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const message = await extractGoogleErrorMessage(response);
    throw new GoogleSheetsApiError(response.status, message);
  }

  return (await response.json()) as T;
}

async function extractGoogleErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
      error_description?: string;
    };
    if (typeof body.error === "object" && body.error?.message) {
      return body.error.message;
    }
    if (typeof body.error_description === "string" && body.error_description) {
      return body.error_description;
    }
    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  } catch {
    // Ignore non-JSON error payloads and fall back to status text.
  }
  return response.statusText || `Google Sheets API error (${response.status})`;
}
