import { BadRequestException } from "@nestjs/common";
import crypto from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  GOOGLE_SHEETS_READONLY_SCOPE,
  GOOGLE_SHEETS_READWRITE_SCOPE,
  GoogleSheetsApiError,
  batchGetSpreadsheetValues,
  batchUpdateSpreadsheetValues,
  clearGoogleSheetsTokenCache,
  getSpreadsheetSheetTitles,
  getSpreadsheetValues,
} from "./google-sheets.client";

describe("google-sheets.client", () => {
  let tempDir: string;
  let credentialsFile: string;
  const originalEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    tempDir = await mkdtemp(path.join(os.tmpdir(), "vietsage-gsheets-"));
    credentialsFile = path.join(tempDir, "service-account.json");
    await writeFile(
      credentialsFile,
      JSON.stringify({
        type: "service_account",
        client_email: "sheets-sync@example.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        private_key_id: "key-1",
      }),
      "utf8",
    );
  });

  afterAll(async () => {
    if (originalEnv === undefined) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = originalEnv;
    }
    global.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearGoogleSheetsTokenCache();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsFile;
  });

  it("throws BadRequestException when GOOGLE_APPLICATION_CREDENTIALS is missing", async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    await expect(getSpreadsheetSheetTitles("sheet-1")).rejects.toThrow(BadRequestException);
  });

  it("exchanges a signed JWT for an access token, caches it, and sorts sheet titles", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sheets: [
              { properties: { index: 2, title: "Dịch vụ" } },
              { properties: { index: 0, title: "Nhóm dịch vụ" } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ values: [["Tên"], ["Massage"]] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = fetchMock;

    const titles = await getSpreadsheetSheetTitles("sheet-123", [GOOGLE_SHEETS_READONLY_SCOPE]);
    const values = await getSpreadsheetValues("sheet-123", "'Nhóm dịch vụ'!A1:Z");

    expect(titles).toEqual(["Nhóm dịch vụ", "Dịch vụ"]);
    expect(values).toEqual([["Tên"], ["Massage"]]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect((tokenInit as RequestInit).method).toBe("POST");
    const assertion = new URLSearchParams((tokenInit as RequestInit).body as URLSearchParams).get(
      "assertion",
    );
    expect(assertion?.split(".")).toHaveLength(3);

    const [valuesUrl, valuesInit] = fetchMock.mock.calls[2];
    expect(valuesUrl).toContain("/spreadsheets/sheet-123/values/");
    expect(valuesUrl).toContain("valueRenderOption=UNFORMATTED_VALUE");
    expect((valuesInit as RequestInit).headers).toMatchObject({
      Authorization: "Bearer token-1",
    });
  });

  it("supports batchGet and batchUpdate and maps HTTP failures to GoogleSheetsApiError", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-ro", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            valueRanges: [{ values: [["A"]] }, { values: [["B"]] }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-rw", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 403, message: "The caller does not have permission" } }),
          { status: 403 },
        ),
      );
    global.fetch = fetchMock;

    const batch = await batchGetSpreadsheetValues("sheet-1", ["'A'!A1:Z", "'B'!A1:Z"]);
    expect(batch).toEqual([{ values: [["A"]] }, { values: [["B"]] }]);
    expect(fetchMock.mock.calls[1][0]).toContain("values:batchGet?");
    expect(fetchMock.mock.calls[1][0]).toContain("valueRenderOption=UNFORMATTED_VALUE");

    await expect(
      batchUpdateSpreadsheetValues(
        "sheet-1",
        [{ range: "'A'!A2", values: [["CODE_1"]] }],
        [GOOGLE_SHEETS_READWRITE_SCOPE],
      ),
    ).rejects.toMatchObject({
      name: "GoogleSheetsApiError",
      status: 403,
      code: 403,
    } satisfies Partial<GoogleSheetsApiError>);
  });
});
