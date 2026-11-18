import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import ts from "typescript";
import {
  computeNextVietnamDailySlot,
  computeNextVietnamTenMinuteCatchUp,
  getVietnamCalendarDate,
  getVietnamTodayDate,
  KBTT_FIXED_SCHEDULE_SLOTS,
  KBTT_SCHEDULE_TIMEZONE,
  kbttDailyMovementItemSchema,
  kbttDailyMovementsQuerySchema,
  kbttDailyMovementsResponseSchema,
  kbttMovementKindSchema,
  canSelectKbttDeclaration,
  formatKbttDraftForDisplay,
  formatKbttDraftForProvider,
  getKbttListState,
  getKbttDeclarationDisplayStatus,
  getKbttSubmissionIssue,
  getRowPartitionTab,
  KBTT_FORBIDDEN_KEYS,
  kbttAutoSubmitConfigSchema,
  kbttAutoSubmitRunSummarySchema,
  kbttAutoSubmitStateSchema,
  kbttConnectionSchema,
  kbttCatalogListSchema,
  kbttCredentialsSchema,
  kbttDeclarationListItemSchema,
  kbttDeclarationListSchema,
  kbttDeliverySchema,
  kbttDeclarationRecordSchema,
  kbttDeclarationStatusSchema,
  kbttDerivedStatusSchema,
  kbttPaginationQuerySchema,
  kbttErrorCode,
  kbttErrorMessage,
  kbttOccupantDeclarationDetailSchema,
  sanitizeErrorMessage,
  sanitizeProviderDetail,
  saveKbttDraftPayloadSchema,
} from "./types/kbtt-contract.ts";
import { buildWorkspaceNavigation } from "../workspace/config/workspace-registry.ts";

test("in-house BCA scope accepts twenty stays and rejects empty, oversized and unbounded scopes", () => {
  const ids = Array.from({ length: 20 }, (_, index) => `stay-${index}`);
  assert.equal(kbttPaginationQuerySchema.parse({ stayIds: ids.join(",") }).stayIds, ids.join(","));
  assert.equal(kbttPaginationQuerySchema.safeParse({}).success, true);
  for (const stayIds of ["", "stay-1,", ",stay-1", "x".repeat(129), [...ids, "extra"].join(",")]) {
    assert.equal(kbttPaginationQuerySchema.safeParse({ stayIds }).success, false);
  }
});

test("scoped BCA query loads every page and refuses changing totals, duplicates and partial reads", async () => {
  const source = readFileSync(new URL("./resources/kbtt-resource.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let pages = [];
  const calls = [];
  const repository = { listDeclarations: async (_hotel, query, signal) => {
    calls.push({ query, signal });
    const page = pages[query.page - 1];
    if (page instanceof Error) throw page;
    return page;
  } };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name.includes("query-resource")) return { createResource: () => (config) => config, defineQuery: (config) => config, defineMutation: (config) => config };
    if (name.includes("kbtt-repository")) return { kbttRepository: repository };
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  const query = module.exports.kbttResource.queries.inHouseDeclarations.queryFn;
  const signal = new AbortController().signal;
  const run = () => query({ scope: { hotelId: "hotel-1" }, input: { stayIds: "stay-1,stay-2" }, signal });
  const first = Object.assign([{ occupantId: "a" }], { total: 2, totalPages: 2, delivery: { state: "PAUSED" } });
  pages = [first, Object.assign([{ occupantId: "b" }], { total: 2 })];
  const result = await run();
  assert.deepEqual(result.map((row) => row.occupantId), ["a", "b"]);
  assert.equal(result.delivery.state, "PAUSED");
  assert.deepEqual(calls.map(({ query }) => query), [
    { stayIds: "stay-1,stay-2", page: 1, limit: 100 },
    { stayIds: "stay-1,stay-2", page: 2, limit: 100 },
  ]);
  assert.ok(calls.every((call) => call.signal === signal));
  pages = [first, Object.assign([{ occupantId: "a" }], { total: 2 })];
  await assert.rejects(run, /Chưa tải đủ/);
  pages = [first, Object.assign([{ occupantId: "b" }], { total: 3 })];
  await assert.rejects(run, /vừa thay đổi/);
  pages = [first, Object.assign([], { total: 2 })];
  await assert.rejects(run, /Chưa tải đủ/);
  pages = [first, new Error("unavailable")];
  await assert.rejects(run, /unavailable/);
});

test("KBTT validates write-only credentials, strips secret fields, preserves password whitespace, sanitizes errors, and scopes owner navigation", () => {
  const credentials = kbttCredentialsSchema.parse({
    username: " owner ",
    password: " password ",
  });
  assert.deepEqual(credentials, { username: "owner", password: " password " });
  const spaced = kbttCredentialsSchema.parse({
    username: " demo tich hop ",
    password: " my_secret ",
  });
  assert.deepEqual(spaced, {
    username: "demotichhop",
    password: " my_secret ",
  });
  for (const input of [
    { username: " ", password: "password" },
    { username: "owner", password: "" },
    { username: "x".repeat(121), password: "password" },
    { username: "owner", password: "x".repeat(257) },
    { username: "owner", password: "password", tenantId: "another-tenant" },
  ])
    assert.equal(kbttCredentialsSchema.safeParse(input).success, false);

  const connection = kbttConnectionSchema.parse({
    configured: true,
    status: "CONNECTED",
    username: "owner",
    maskedUsername: "o***r",
    csltId: "123",
    lastCheckedAt: null,
    lastConnectedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    password: "must-not-return",
    accessToken: "must-not-return",
    refreshToken: "must-not-return",
    ciphertext: "must-not-return",
  });
  assert.equal(connection.username, "owner");
  const { username: _username, ...legacyConnection } = connection;
  assert.equal(kbttConnectionSchema.parse(legacyConnection).username, null);
  for (const field of [
    "password",
    "accessToken",
    "refreshToken",
    "ciphertext",
  ]) {
    assert.equal(field in connection, false);
  }
  assert.equal(
    kbttErrorCode({ data: { code: "KBTT_AUTH_FAILED" } }),
    "KBTT_AUTH_FAILED",
  );
  assert.equal(
    kbttErrorCode({ error: { code: "KBTT_PROVIDER_UNAVAILABLE" } }),
    "KBTT_PROVIDER_UNAVAILABLE",
  );
  assert.equal(kbttErrorCode({ message: "password=do-not-render" }), null);
  assert.equal(kbttErrorCode({ code: "constructor" }), null);
  assert.equal(
    kbttErrorMessage("password=do-not-render"),
    kbttErrorMessage(null),
  );
  assert.equal(
    kbttErrorMessage("KBTT_AUTH_FAILED"),
    "Tài khoản hoặc mật khẩu không đúng. Vui lòng đăng nhập lại.",
  );

  for (const permission of [
    "hotel.kbtt.declarations.view",
    "hotel.kbtt.declarations.manage",
  ]) {
    const entry = buildWorkspaceNavigation({
      persona: "owner",
      permissions: [permission],
      hotelId: "hotel-1",
    }).find((item) => item.key === "staff.front-desk");
    assert.equal(entry?.label, "Quản lý khách lưu trú");
    assert.equal(entry?.href, "/owner/hotels/hotel-1/front-desk");
  }
  for (const scope of [
    { persona: "owner", permissions: ["hotel.kbtt.view"] },
    { persona: "owner", permissions: [], hotelId: "hotel-1" },
    {
      persona: "front_desk",
      permissions: ["hotel.kbtt.view"],
      hotelId: "hotel-1",
    },
  ]) {
    assert.equal(
      buildWorkspaceNavigation(scope).some(
        (item) => item.key === "owner.hotel.kbtt",
      ),
      false,
    );
  }
  const staffEntry = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.kbtt.declarations.view"],
    hotelId: "hotel-1",
  }).find((item) => item.key === "staff.front-desk");
  assert.equal(staffEntry?.href, "/hotels/hotel-1/front-desk");
  assert.equal(
    buildWorkspaceNavigation({
      persona: "front_desk",
      permissions: [],
      hotelId: "hotel-1",
    }).some((item) => item.key === "staff.front-desk"),
    false,
  );

  const catalog = kbttCatalogListSchema.parse([
    {
      id: "catalog-1",
      kind: "NATIONALITY",
      code: "VNM",
      parentCode: null,
      nameVi: "Việt Nam",
      nameEn: "Vietnam",
      isActive: true,
      fetchedAt: "2026-09-13T10:00:00.000Z",
    },
  ]);
  assert.equal(catalog[0].code, "VNM");
});

test("KBTT operational declarations contract validates list rows, fails closed on forbidden keys, and partitions tabs", () => {
  const sampleVietnameseRow = {
    occupantId: "occ-1",
    stayId: "stay-1",
    hotelId: "hotel-1",
    roomId: "room-1",
    roomNumber: "101",
    isPrimary: true,
    fullName: "Nguyen Van A",
    phone: "0901234567",
    identityNumber: "001200001234",
    dateOfBirth: "1990-01-01",
    gender: "M",
    nationality: "VNM",
    residencePlace: "Ha Noi",
    citizenshipKind: "VIETNAMESE",
    derivedStatus: "DRAFT",
    stayStatus: "ACTIVE",
    reservationCode: "RES-001",
    checkedInAt: "2026-09-13T10:00:00.000Z",
    plannedCheckInAt: "2026-09-13T10:00:00.000Z",
    plannedCheckOutAt: "2026-09-15T12:00:00.000Z",
    declaration: {
      id: "decl-1",
      revision: 1,
      status: "DRAFT",
      declarationKind: "VIETNAMESE",
      providerCode: null,
      providerMessage: null,
      submittedAt: null,
      createdAt: "2026-09-13T10:05:00.000Z",
      updatedAt: "2026-09-13T10:05:00.000Z",
    },
  };

  const parsedRow = kbttDeclarationListItemSchema.parse(sampleVietnameseRow);
  assert.equal(parsedRow.occupantId, "occ-1");
  assert.equal(parsedRow.derivedStatus, "DRAFT");

  const sampleList = [
    sampleVietnameseRow,
    {
      ...sampleVietnameseRow,
      occupantId: "occ-2",
      citizenshipKind: null,
      derivedStatus: "MISSING_PROFILE",
      declaration: null,
    },
    {
      ...sampleVietnameseRow,
      occupantId: "occ-3",
      derivedStatus: "SUBMITTED",
      declaration: {
        ...sampleVietnameseRow.declaration,
        id: "decl-3",
        status: "SUBMITTED",
        submittedAt: "2026-09-13T11:00:00.000Z",
      },
    },
  ];

  const parsedList = kbttDeclarationListSchema.parse(sampleList);
  assert.equal(parsedList.length, 3);

  assert.equal(getRowPartitionTab(parsedList[0]), "vietnamese");
  assert.equal(getRowPartitionTab(parsedList[1]), "needs_completion");
  assert.equal(getRowPartitionTab(parsedList[2]), "submitted_or_error");
  assert.equal(
    getRowPartitionTab({ derivedStatus: "DRAFT", citizenshipKind: null }),
    "needs_completion",
  );

  // Detail contract validation
  const detailData = {
    occupant: {
      id: "occ-1",
      stayId: "stay-1",
      hotelId: "hotel-1",
      fullName: "Nguyen Van A",
      phone: "0901234567",
      identityNumber: "001200001234",
      dateOfBirth: "1990-01-01",
      gender: "M",
      nationality: "VNM",
      residencePlace: "Ha Noi",
      isPrimary: true,
      citizenshipKind: "VIETNAMESE",
    },
    declaration: {
      id: "decl-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      occupantId: "occ-1",
      declarationKind: "VIETNAMESE",
      revision: 1,
      status: "DRAFT",
      draftPayload: {
        hoTen: "Nguyen Van A",
        soGiayTo: "001200001234",
        loaiGiayTo: 1,
      },
      providerCode: null,
      providerMessage: null,
      submittedAt: null,
      version: 1,
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T10:00:00.000Z",
    },
    derivedStatus: "DRAFT",
  };
  const parsedDetail = kbttOccupantDeclarationDetailSchema.parse(detailData);
  assert.equal(parsedDetail.occupant.fullName, "Nguyen Van A");
  assert.equal(parsedDetail.declaration?.status, "DRAFT");

  const statusRows = kbttDeclarationStatusSchema.options.map((status) => ({
    ...sampleVietnameseRow,
    derivedStatus: status,
    declaration: { ...sampleVietnameseRow.declaration, status },
  }));
  assert.deepEqual(
    kbttDeclarationListSchema.parse(statusRows).map((row) => row.derivedStatus),
    kbttDeclarationStatusSchema.options,
  );
  for (const status of kbttDeclarationStatusSchema.options) {
    const detail = kbttOccupantDeclarationDetailSchema.parse({
      ...detailData,
      derivedStatus: status,
      declaration: { ...detailData.declaration, status },
    });
    assert.equal(detail.declaration.status, status);
    assert.equal(detail.derivedStatus, status);
  }
  for (const status of ["REJECTED", "INVALID", null, 1]) {
    assert.equal(kbttDeclarationListSchema.safeParse([
      ...sampleList, { ...sampleVietnameseRow, derivedStatus: status },
    ]).success, false);
    assert.equal(kbttDeclarationListSchema.safeParse([{
      ...sampleVietnameseRow,
      declaration: { ...sampleVietnameseRow.declaration, status },
    }]).success, false);
    assert.equal(kbttOccupantDeclarationDetailSchema.safeParse({
      ...detailData,
      declaration: { ...detailData.declaration, status },
    }).success, false);
  }

  // Fail-closed verification on forbidden keys
  for (const forbidden of KBTT_FORBIDDEN_KEYS) {
    const invalidPayload = {
      citizenshipKind: "VIETNAMESE",
      data: {
        hoTen: "Nguyen Van A",
        [forbidden]: "malicious-value",
      },
    };
    assert.equal(
      saveKbttDraftPayloadSchema.safeParse(invalidPayload).success,
      false,
      `Should reject forbidden key: ${forbidden}`,
    );
  }

  // Valid Vietnamese draft payload
  const validVietnameseDraft = {
    citizenshipKind: "VIETNAMESE",
    data: {
      hoTen: "Nguyen Van A",
      gioiTinh: "M",
      soGiayTo: "001200001234",
      loaiGiayTo: 1,
      lyDoCuTru: 1,
      soPhong: "101",
      ngayThangNamSinhStr: "1990-01-01",
      ngayDenCsltStr: "2026-09-13 10:00:00",
      ngayDiDuKienStr: "2026-09-15 12:00:00",
    },
  };
  assert.equal(
    saveKbttDraftPayloadSchema.safeParse(validVietnameseDraft).success,
    true,
  );

  // Valid Foreign draft payload
  const validForeignDraft = {
    citizenshipKind: "FOREIGN",
    data: {
      hoTen: "John Doe",
      quocTich: "USA",
      soHoChieu: "A12345678",
      gioiTinh: "M",
      loaiNgayThangNamSinh: "D",
      ngayThangNamSinhStr: "1988-05-20",
      soPhong: "201",
      ngayDenCsltStr: "2026-09-13 10:00:00",
      ngayDiDuKienStr: "2026-09-15 12:00:00",
      thoiHanTamTruStr: "2026-09-20 12:00:00",
    },
  };
  assert.equal(
    saveKbttDraftPayloadSchema.safeParse(validForeignDraft).success,
    true,
  );

  // Declaration record schema parse
  const parsedRecord = kbttDeclarationRecordSchema.parse(
    detailData.declaration,
  );
  assert.equal(parsedRecord.id, "decl-1");
});

test("KBTT status contracts stay aligned and locked API states reject writes", () => {
  const schemaUrl = new URL(
    "../../../../../services/auth-service/src/modules/kbtt/domain/schemas/kbtt.schema.ts",
    import.meta.url,
  );
  const source = readFileSync(schemaUrl, "utf8");
  // Execute the pure status section without booting Nest or the property module.
  const statusSource = source.slice(
    source.indexOf("export const kbttDeclarationStatusSchema"),
    source.indexOf("export const kbttVietnameseDraftDataSchema"),
  );
  assert.ok(statusSource.includes("assertKbttDeclarationMutable"));
  const backendRequire = createRequire(schemaUrl);
  const backend = new Function("z", "ConflictException",
    stripTypeScriptTypes(statusSource).replaceAll("export ", "") +
    "\nreturn { kbttDeclarationStatusSchema, kbttDerivedStatusSchema, assertKbttDeclarationMutable };",
  )(backendRequire("zod").z, backendRequire("@nestjs/common").ConflictException);

  assert.deepEqual(kbttDeclarationStatusSchema.options, [
    "DRAFT", "READY", "SUBMITTED", "FAILED", "UNKNOWN", "CANCELLED",
  ]);
  assert.equal(kbttDeclarationStatusSchema.safeParse("SENDING").success, false);
  assert.equal(kbttPaginationQuerySchema.safeParse({ status: "SENDING" }).success, false);
  assert.deepEqual(kbttDeclarationStatusSchema.options, backend.kbttDeclarationStatusSchema.options);
  assert.deepEqual(kbttDerivedStatusSchema.options, backend.kbttDerivedStatusSchema.options);
  for (const status of ["UNKNOWN", "CANCELLED"]) {
    assert.throws(() => backend.assertKbttDeclarationMutable(status), (error) => {
      assert.equal(error.getStatus(), 409);
      assert.equal(error.getResponse().code, "KBTT_DECLARATION_LOCKED");
      return true;
    });
  }
  for (const status of [undefined, "DRAFT", "READY", "FAILED", "SUBMITTED"]) {
    assert.doesNotThrow(() => backend.assertKbttDeclarationMutable(status));
  }
  const serviceSource = readFileSync(new URL("../../application/kbtt.service.ts", schemaUrl), "utf8");
  for (const variable of ["existing", "declaration"]) {
    assert.match(serviceSource, new RegExp(
      String.raw`const ${variable} = await this\.repository\.findLatestDeclaration\(hotelId, occupantId\);\s+assertKbttDeclarationMutable\(${variable}\?\.status\);`,
    ));
  }
  assert.equal(kbttErrorCode({ code: "KBTT_DECLARATION_LOCKED" }), "KBTT_DECLARATION_LOCKED");
  assert.equal(kbttErrorMessage("INTERNAL_SERVER_ERROR"), "Không thể tải dữ liệu từ máy chủ. Vui lòng thử lại.");
});

test("KBTT list never infers submission success from errors, cached rows, empty filters or locked states", () => {
  const submitted = [{ derivedStatus: "SUBMITTED" }];
  assert.equal(getKbttListState(submitted, "pending"), "loading");
  assert.equal(getKbttListState(submitted, "error"), "error");
  assert.equal(getKbttListState([], "pending"), "loading");
  assert.equal(getKbttListState([], "error"), "error");
  assert.equal(getKbttListState([], "success"), "empty");
  assert.equal(getKbttListState(submitted, "success"), "submitted");
  for (const status of kbttDerivedStatusSchema.options.filter((value) => value !== "SUBMITTED")) {
    const row = { derivedStatus: status };
    assert.equal(getKbttListState([row], "success"), "pending", status);
    assert.equal(getKbttListState([...submitted, row], "success"), "pending", status);
  }
  for (const status of kbttDerivedStatusSchema.options) {
    assert.equal(canSelectKbttDeclaration({ derivedStatus: status }),
      ["MISSING_PROFILE", "DRAFT", "READY", "FAILED"].includes(status), status);
  }
  const pageSource = readFileSync(new URL("./components/kbtt-declarations-page.tsx", import.meta.url), "utf8");
  const parsedPage = ts.createSourceFile("kbtt-declarations-page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsedPage.parseDiagnostics, [], "KBTT page must remain valid TSX");
  assert.match(pageSource, /<KbttDeliveryStatus/);
  assert.match(pageSource, /isListReady = declarationsQuery\.isSuccess && !declarationsQuery\.isFetching/);
  assert.match(pageSource, /canEdit=\{isSelectable\}/);
  assert.match(pageSource, /isReadOnly = !detailQuery\.isSuccess \|\| detailQuery\.isFetching \|\| !canSelectKbttDeclaration/);
  assert.doesNotMatch(pageSource, /Toàn bộ hồ sơ đã gửi BCA thành công|Tất cả khách đều đã được gửi BCA/);
});

test("KBTT UI exposes one edit-to-submit action and no local status workflow", () => {
  assert.equal(canSelectKbttDeclaration({ derivedStatus: "SUBMITTED" }), false);
  assert.equal(canSelectKbttDeclaration({ derivedStatus: "DRAFT" }), true);
  assert.equal(
    canSelectKbttDeclaration({ derivedStatus: "MISSING_PROFILE" }),
    true,
  );

  const providerDates = {
    hoTen: "John Doe",
    ngayThangNamSinhStr: "1988-05-20",
    ngayDenCsltStr: "2026-09-14 10:00:00",
    ngayDiDuKienStr: "2026-09-14 21:00:00",
    thoiHanTamTruStr: "2026-09-14 21:00:00",
  };
  const displayDates = formatKbttDraftForDisplay(providerDates);
  assert.deepEqual(displayDates, {
    hoTen: "John Doe",
    ngayThangNamSinhStr: "20/05/1988",
    ngayDenCsltStr: "10:00:00 14/09/2026",
    ngayDiDuKienStr: "21:00:00 14/09/2026",
    thoiHanTamTruStr: "21:00:00 14/09/2026",
  });
  assert.deepEqual(formatKbttDraftForProvider(displayDates), providerDates);

  assert.equal(
    sanitizeProviderDetail("Bản khai báo 1: Khách đang tạm trú tại CSLT."),
    "Bản khai báo 1: Khách đang tạm trú tại CSLT.",
  );
  assert.equal(
    sanitizeProviderDetail({
      status: 422,
      message: "400",
      data: { detail: "Bản khai báo 1: Số hộ chiếu đang tạm trú tại CSLT." },
    }),
    "Bản khai báo 1: Số hộ chiếu đang tạm trú tại CSLT.",
  );
  assert.equal(sanitizeProviderDetail("Bearer secret-token-xyz"), null);
  assert.equal(
    sanitizeProviderDetail({
      status: 400,
      message: "BAD_REQUEST",
      data: {
        detail: [
          "Phường/xã: Mã phường xã là bắt buộc",
          "Nơi cư trú: Nơi cư trú là bắt buộc",
        ],
      },
    }),
    "Phường/xã: Mã phường xã là bắt buộc; Nơi cư trú: Nơi cư trú là bắt buộc",
  );
  assert.equal(
    sanitizeErrorMessage("Mã phường xã không thuộc tỉnh thành đã chọn"),
    "Mã phường xã không thuộc tỉnh thành đã chọn",
  );
  assert.equal(
    sanitizeErrorMessage("password=123456"),
    kbttErrorMessage(null),
  );

  const pageSource = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pageSource, /saveInlineRow/);
  assert.match(
    pageSource,
    /await saveInlineRow\(row\);[\s\S]*submitMutation\.mutateAsync/,
  );
  assert.match(pageSource, /htmlFor="gioiTinh"[\s\S]*?id="gioiTinh"/);
  assert.match(pageSource, /htmlFor="ngayThangNamSinhStr"[\s\S]*?id="ngayThangNamSinhStr"/);
  assert.match(pageSource, /htmlFor="loaiGiayTo"[\s\S]*?id="loaiGiayTo"/);
  assert.match(pageSource, /row\.fullName/);
  assert.doesNotMatch(pageSource, /Trường bắt buộc để gửi BCA/);
  assert.doesNotMatch(
    pageSource,
    /Chỉnh sửa hàng loạt|Bấm để chỉnh sửa chi tiết/,
  );
  assert.match(pageSource, /Gửi BCA/);
  assert.doesNotMatch(pageSource, /Xếp hàng|xếp hàng|value="QUEUED"/);
  assert.match(pageSource, /Hồ sơ của lần lưu trú này đã gửi BCA/);
  assert.match(pageSource, /[" >]Xem(?: chi tiết)?[" <]/);
  assert.match(pageSource, /handleSubmitAll/);
  assert.doesNotMatch(
    pageSource,
    /type="checkbox"|selectedOccupantIds|handleSubmitSelected|Upload BCA đã chọn/,
  );
  assert.match(pageSource, /const isSelectable = canManage && isListReady && canSelectKbttDeclaration\(row\)/);
  assert.match(pageSource, /formatStayDateTimeForForm/);
  assert.match(pageSource, /HH:mm:ss DD\/MM\/YYYY/);
  const tableSource = pageSource.slice(
    pageSource.indexOf("{/* Data Table */}"),
    pageSource.indexOf("{/* Pagination Footer */}"),
  );
  assert.doesNotMatch(tableSource, /Ngày check-in|Ngày check-out|CalendarIcon/);
  assert.doesNotMatch(pageSource, /placeholder="YYYY-MM-DD HH:mm:ss"/);
  assert.doesNotMatch(
    pageSource,
    /Đánh dấu sẵn sàng|Lưu bản nháp|StatusBadge|submitStay/,
  );

  const resourceSource = readFileSync(
    new URL("./resources/kbtt-resource.ts", import.meta.url),
    "utf8",
  );
  assert.match(resourceSource, /submit:\s*defineMutation/);
  assert.doesNotMatch(resourceSource, /markReady|submitStay/);

  const repositorySource = readFileSync(
    new URL("./repositories/kbtt-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repositorySource, /async submit\(/);
  assert.doesNotMatch(repositorySource, /markReady|submitStay/);
});

test("KBTT auto-submit contract validates schedule config, run summaries, and state schemas", () => {
  // Valid config
  const validConfig = kbttAutoSubmitConfigSchema.parse({
    autoSubmitEnabled: true,
    autoSubmitTime: null,
  });
  assert.deepEqual(validConfig, {
    autoSubmitEnabled: true,
    autoSubmitTime: null,
  });

  // Disabled config with null time
  const disabledConfig = kbttAutoSubmitConfigSchema.parse({
    autoSubmitEnabled: false,
    autoSubmitTime: null,
  });
  assert.deepEqual(disabledConfig, {
    autoSubmitEnabled: false,
    autoSubmitTime: null,
  });

  // Rejects invalid time format
  assert.equal(
    kbttAutoSubmitConfigSchema.safeParse({
      autoSubmitEnabled: true,
      autoSubmitTime: "24:00",
    }).success,
    false,
  );

  // Valid run summary
  const summary = kbttAutoSubmitRunSummarySchema.parse({
    id: "run-1",
    hotelId: "hotel-1",
    scheduledFor: "2026-09-15 04:30:00",
    startedAt: "2026-09-15 04:30:01",
    finishedAt: "2026-09-15 04:30:05",
    status: "COMPLETED",
    totalEligible: 3,
    successCount: 3,
    failureCount: 0,
    unknownCount: 0,
    errorMessage: null,
  });
  assert.equal(summary.status, "COMPLETED");
  assert.equal(summary.totalEligible, 3);

  // State schema with recent runs and pendingSchedule
  const stateWithPending = kbttAutoSubmitStateSchema.parse({
    autoSubmitEnabled: true,
    autoSubmitTime: null,
    pendingSchedule: summary,
    recentRuns: [summary],
  });
  assert.equal(stateWithPending.autoSubmitEnabled, true);
  assert.equal(stateWithPending.pendingSchedule?.status, "COMPLETED");
  assert.equal(stateWithPending.recentRuns.length, 1);

  // Auto-submit resource invalidations verification
  const resourceSrc = readFileSync(
    new URL("./resources/kbtt-resource.ts", import.meta.url),
    "utf8",
  );
  assert.match(resourceSrc, /testAutoSubmit:\s*defineMutation[\s\S]*?operation:\s*"autoSubmitConfig"[\s\S]*?operation:\s*"declarations"[\s\S]*?operation:\s*"declarationDetail"/);
  assert.match(resourceSrc, /scheduleAutoSubmit:\s*defineMutation[\s\S]*?operation:\s*"autoSubmitConfig"[\s\S]*?operation:\s*"declarations"[\s\S]*?operation:\s*"declarationDetail"/);
  assert.match(resourceSrc, /cancelScheduledAutoSubmit:\s*defineMutation[\s\S]*?operation:\s*"autoSubmitConfig"[\s\S]*?operation:\s*"declarations"[\s\S]*?operation:\s*"declarationDetail"/);

  // Auto-submit hook polling and terminal invalidation contract verification
  const hookSrc = readFileSync(
    new URL("./hooks/use-kbtt-auto-submit.ts", import.meta.url),
    "utf8",
  );
  // Must poll through active RUNNING runs even if pendingSchedule is expired or null
  assert.match(hookSrc, /RUNNING/);
  assert.match(hookSrc, /hasActiveRun[\s\S]*?recentRuns/);
  assert.match(hookSrc, /declarations\.invalidateAll/);
  assert.match(hookSrc, /declarationDetail\.invalidateAll/);
  assert.match(hookSrc, /autoSubmitConfig\.invalidateAll/);

  // State schema with activeRun or RUNNING status
  const runningSummary = { ...summary, status: "RUNNING" };
  const stateWithRunning = kbttAutoSubmitStateSchema.parse({
    autoSubmitEnabled: true,
    autoSubmitTime: null,
    activeRun: runningSummary,
    recentRuns: [runningSummary],
  });
  assert.equal(stateWithRunning.activeRun?.status, "RUNNING");
});

test("KBTT BFF submit route delegates timeout to backend/provider via timeoutMs: false without retry, while global default remains 10s", () => {
  const routeSrc = readFileSync(
    new URL(
      "../../app/api/hotel-ops/hotels/[hotelId]/kbtt/declarations/[occupantId]/[action]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const httpServerSrc = readFileSync(
    new URL("../../core/http/http-server.ts", import.meta.url),
    "utf8",
  );

  // Global DEFAULT_TIMEOUT_MS in http-server.ts must remain 10_000ms
  assert.match(httpServerSrc, /const DEFAULT_TIMEOUT_MS = 10_000;/);

  // HttpServerRequestConfig must support timeoutMs?: number | false
  assert.match(
    httpServerSrc,
    /timeoutMs\?:\s*number\s*\|\s*false;/,
    "HttpServerRequestConfig must support boolean false to disable timeout",
  );

  // When timeoutMs is false, no timeout controller is created
  assert.match(
    httpServerSrc,
    /options\.timeoutMs === false\s*\?\s*null\s*:\s*createTimeoutController/,
    "httpServer.request must not create timeout controller when timeoutMs is false",
  );

  // BFF submit route passes timeoutMs: false to delegate timeout to backend/provider
  assert.match(
    routeSrc,
    /timeoutMs:\s*false/,
    "Submit route must pass timeoutMs: false to delegate timeout to provider",
  );

  // BFF route must NOT have a custom numeric timeout constant
  assert.doesNotMatch(
    routeSrc,
    /KBTT_SUBMIT_TIMEOUT_MS/,
    "Submit route must not define custom timeout constant",
  );

  // Must not introduce retries at BFF layer to avoid duplicated provider side effects
  assert.doesNotMatch(
    routeSrc,
    /\b(retry|retries|maxAttempts)\b/i,
    "BFF route must not add retries",
  );
});

test("KBTT declarations page sends concurrently and retains inline failures without a summary popup", () => {
  const pageSrc = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );

  // Must use Promise.allSettled for concurrent row submissions
  assert.match(
    pageSrc,
    /Promise\.allSettled\s*\(/,
    "handleSubmitAll must execute via Promise.allSettled",
  );

  // Must not loop sequentially with for...of in handleSubmitAll
  const handleSubmitAllBlock = pageSrc.match(
    /const handleSubmitAll = useCallback\(async \(\) => {([\s\S]*?)},\s*\[/,
  )?.[1];
  assert.ok(handleSubmitAllBlock, "handleSubmitAll function must exist");

  assert.doesNotMatch(
    handleSubmitAllBlock,
    /for\s*\(\s*const\s+\w+\s+of\s+unsubmittedRows\s*\)\s*{[\s\S]*?await\s+submitMutation/,
    "handleSubmitAll must not sequentially await row submit in a for...of loop",
  );

  // Preserve rejected-row evidence without interrupting the operator.
  assert.match(
    handleSubmitAllBlock,
    /status === "rejected"/,
    "Must retain each rejected row",
  );
  assert.match(
    handleSubmitAllBlock,
    /errorText\(/,
    "Must extract error text for rejected items",
  );
});

test("KBTT declarations table provides Sửa button to open DeclarationModal for detail editing, and modal supports saving to DB with Tỉnh/Xã", () => {
  const pageSource = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );

  // RowActionMenu must render Sửa button when status is not SUBMITTED
  assert.match(
    pageSource,
    /title="[^"]*chỉnh chi tiết[^"]*"[\s\S]*?>Sửa<\/span>/i,
    "RowActionMenu must provide a Sửa button to open detail modal",
  );

  // DeclarationModal must provide a Lưu vào DB button to persist edits
  assert.match(
    pageSource,
    /Lưu (?:vào (?:CSDL|DB)|thông tin)/,
    "DeclarationModal must provide a button to save to DB without submitting",
  );

  // DeclarationModal must support isDevMode to allow editing submitted declarations
  assert.match(
    pageSource,
    /isDevMode=\{isDevMode\}/,
    "DeclarationModal must receive isDevMode prop",
  );

  // Vietnamese form in DeclarationModal must support maTT (Tỉnh) and maPX (Xã)
  assert.match(
    pageSource,
    /id="maTT"[\s\S]*?id="maPX"/,
    "DeclarationModal must render maTT and maPX for Vietnamese occupants",
  );
});

test("KBTT background delivery retains bounded issues and legacy unsent records require explicit review", () => {
  const issue = { id: "op-1", kind: "CHECKOUT", status: "UNKNOWN", roomNumber: "101",
    fullName: "Nguyễn Văn An", message: "Cần đối soát trước khi gửi tiếp.", updatedAt: "2026-11-05T08:00:00.000Z" };
  const delivery = { mode: "BACKGROUND", state: "RUNNING", lifecycleEnabled: false,
    pendingCount: 1, reviewCount: 1, lastSucceededAt: null, recentIssues: [issue] };
  assert.deepEqual(kbttDeliverySchema.parse(delivery), delivery);
  assert.equal(kbttDeliverySchema.safeParse({ ...delivery, reviewCount: -1 }).success, false);
  assert.equal(kbttDeliverySchema.safeParse({ ...delivery, recentIssues: Array(21).fill(issue) }).success, false);
  assert.equal(kbttDeliverySchema.safeParse({ ...delivery, state: "SUCCESS" }).success, false);
  const legacyUnsent = { status: "READY", providerCode: "LOCAL_QUEUED" };
  assert.equal(getKbttDeclarationDisplayStatus({ derivedStatus: "READY", declaration: legacyUnsent }), "LOCAL_ERROR");
  assert.equal(canSelectKbttDeclaration({ derivedStatus: "READY", declaration: legacyUnsent }), true);
  for (const status of ["SUBMITTED", "UNKNOWN", "CANCELLED"]) {
    assert.equal(canSelectKbttDeclaration({ derivedStatus: status, declaration: { ...legacyUnsent, status } }), false);
  }
});

test("KBTT declarations page monitors local delivery and never drives automatic BCA writes", () => {
  const pageSource = readFileSync(new URL("./components/kbtt-declarations-page.tsx", import.meta.url), "utf8");
  const statusSource = readFileSync(new URL("./components/kbtt-delivery-status.tsx", import.meta.url), "utf8");
  const resourceSource = readFileSync(new URL("./resources/kbtt-resource.ts", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /countdownSeconds|executeAutoSubmitNow|NEXT_PUBLIC_KBTT_AUTO_SUBMIT|sendBatchSummaryMutation/);
  assert.match(pageSource, /refetchIntervalInBackground: false/);
  assert.match(resourceSource, /declarations: defineQuery\(\{[\s\S]*?structuralSharing: false/);
  assert.match(statusSource, /hasError \|\| !delivery/);
  assert.match(statusSource, /!delivery.lifecycleEnabled/);
  assert.match(statusSource, /Đồng bộ gia hạn và trả phòng đang tạm dừng/);
  assert.doesNotMatch(statusSource, /showSuccessAlert|showErrorAlert|useMutation|fetch\(/);
  assert.doesNotMatch(pageSource, /Bộ Công an đã tiếp nhận hồ sơ|Nộp khai báo thành công/);
});

test("T08B — KBTT daily movements contract, BFF route, query-resource, and section switch", () => {
  // 1. Movement kind schema
  assert.equal(kbttMovementKindSchema.parse("ARRIVAL"), "ARRIVAL");
  assert.equal(kbttMovementKindSchema.parse("DEPARTURE"), "DEPARTURE");
  assert.equal(kbttMovementKindSchema.safeParse("UNKNOWN").success, false);

  // 2. Query schema
  const parsedQuery = kbttDailyMovementsQuerySchema.parse({
    date: "2026-10-27",
    kind: "ARRIVAL",
    q: "Nguyen",
  });
  assert.equal(parsedQuery.date, "2026-10-27");
  assert.equal(parsedQuery.kind, "ARRIVAL");
  assert.equal(parsedQuery.q, "Nguyen");
  assert.equal(parsedQuery.page, 1);
  assert.equal(parsedQuery.limit, 50);

  // Rejects invalid date format
  assert.equal(
    kbttDailyMovementsQuerySchema.safeParse({ date: "27/10/2026", kind: "ARRIVAL" }).success,
    false,
  );

  // 3. Daily movement item schema & response schema
  const sampleMovement = {
    kind: "ARRIVAL",
    reservationId: "res-1",
    stayId: "stay-1",
    reservationCode: "RES-001",
    groupCode: "GRP-01",
    roomId: "room-1",
    roomNumber: "101",
    guestDisplayName: "Nguyen Van A",
    guestPhone: "0901234567",
    status: "CONFIRMED",
    plannedCheckInAt: "2026-10-27T07:00:00.000Z",
    plannedCheckOutAt: "2026-10-29T05:00:00.000Z",
    actualCheckInAt: null,
    actualCheckOutAt: null,
    occupantCount: 2,
    canCheckIn: true,
    canCheckOut: false,
  };
  const parsedItem = kbttDailyMovementItemSchema.parse(sampleMovement);
  assert.equal(parsedItem.guestDisplayName, "Nguyen Van A");
  assert.equal(parsedItem.occupantCount, 2);

  const sampleResponse = {
    items: [sampleMovement],
    total: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  };
  const parsedResponse = kbttDailyMovementsResponseSchema.parse(sampleResponse);
  assert.equal(parsedResponse.total, 1);
  assert.equal(parsedResponse.items.length, 1);

  // 4. Vietnam timezone helper
  const todayYmd = getVietnamTodayDate();
  assert.match(todayYmd, /^\d{4}-\d{2}-\d{2}$/);

  // 5. BFF route verification
  const routeSource = readFileSync(
    new URL(
      "../../app/api/hotel-ops/hotels/[hotelId]/kbtt/daily-movements/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(routeSource, /export const dynamic = "force-dynamic";/);
  assert.match(routeSource, /executeHotelOpsBackendRequest/);
  assert.match(routeSource, /kbttDailyMovementsQuerySchema\.safeParse/);
  assert.match(routeSource, /kbttDailyMovementsResponseSchema\.parse/);
  assert.match(routeSource, /"Cache-Control": "no-store"/);

  // 6. Repository & Resource verification
  const repoSource = readFileSync(
    new URL("./repositories/kbtt-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repoSource, /async dailyMovements\(/);
  assert.match(repoSource, /kbttDailyMovementsQuerySchema\.parse/);

  const resourceSource = readFileSync(
    new URL("./resources/kbtt-resource.ts", import.meta.url),
    "utf8",
  );
  assert.match(resourceSource, /dailyMovements:\s*defineQuery/);

  // 7. Section switch verification in Declarations Page
  const pageSource = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );
  const parsedPage = ts.createSourceFile(
    "kbtt-declarations-page.tsx",
    pageSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assert.deepEqual(parsedPage.parseDiagnostics, [], "Declarations page must remain valid TSX");
  assert.match(pageSource, /Hồ sơ BCA/);
  assert.match(pageSource, /Khách đến/);
  assert.match(pageSource, /Khách rời/);
  assert.match(pageSource, /KbttDailyMovementsPanel/);

  // 8. Daily movements panel verification
  const panelSource = readFileSync(
    new URL("./components/kbtt-daily-movements-panel.tsx", import.meta.url),
    "utf8",
  );
  const parsedPanel = ts.createSourceFile(
    "kbtt-daily-movements-panel.tsx",
    panelSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assert.deepEqual(parsedPanel.parseDiagnostics, [], "Daily movements panel must be valid TSX");
  assert.match(panelSource, /exportToExcel/);
  assert.match(panelSource, /window\.print\(\)/);
  assert.match(panelSource, /front-desk\?tab=arrivals/);
  assert.match(panelSource, /front-desk\?tab=in-house/);
  assert.match(panelSource, /Asia\/Ho_Chi_Minh/
  );
});




test("local validation failures are distinct from provider rejection and uncertain delivery", () => {
  const row = { derivedStatus: "FAILED", declaration: { status: "FAILED", providerCode: "LOCAL_VALIDATION" } };
  assert.equal(getKbttDeclarationDisplayStatus(row), "LOCAL_ERROR");
  for (const providerCode of ["LOCAL_STATE_CHANGED","CONNECTION_SCOPE_CHANGED","DELIVERY_BUSY","RECONCILIATION_REQUIRED","LOCAL_PREPARATION","LOCAL_STAY_ENDED","DELIVERY_PAUSED","KBTT_NOT_CONFIGURED","KBTT_AUTH_FAILED","KBTT_PROVIDER_UNAVAILABLE","KBTT_TEMP_DISCONNECTED","KBTT_RETRY_PENDING","KBTT_SESSION_ENDED","PRIOR_DAY_MANUAL_REQUIRED"]) {
    assert.equal(getKbttDeclarationDisplayStatus({ ...row, declaration: { ...row.declaration, providerCode } }), "LOCAL_ERROR");
  }
  assert.equal(getKbttDeclarationDisplayStatus({ ...row, declaration: { ...row.declaration, providerCode: "400" } }), "REJECTED");
  assert.equal(getKbttDeclarationDisplayStatus({ ...row, declaration: { ...row.declaration, status: "UNKNOWN" } }), "UNKNOWN");
  assert.equal(getKbttDeclarationDisplayStatus({ ...row, declaration: { ...row.declaration, status: "READY", providerCode: "LOCAL_QUEUED" } }), "LOCAL_ERROR");
  assert.equal(getKbttDeclarationDisplayStatus({ derivedStatus: "DRAFT", declaration: null }), "UNSENT");
});


test("catalog inference only adds fields accepted by the selected citizenship schema", () => {
  const source = readFileSync(new URL("./components/kbtt-declarations-page.tsx", import.meta.url), "utf8");
  for (const field of ["loaiGiayTo", "lyDoCuTru", "maTT", "maPX", "noiCuTru"]) {
    assert.ok(source.includes('citizenshipKind === "VIETNAMESE" && baseFormData.' + field + ' === undefined &&'), field + " must stay domestic-only even when its disabled query has cached data");
  }
  assert.ok(source.includes('citizenshipKind === "FOREIGN" && baseFormData.quocTich === undefined &&'), "Nationality catalog must not add quocTich to the strict domestic draft");
});


test("draft payload keeps only the selected citizenship fields while retaining unknown keys for server validation", () => {
  const mixed = { hoTen: "BCA DEMO", soGiayTo: "001090550510", loaiGiayTo: 1, lyDoCuTru: 1, diaChi: "Synthetic address", soDienThoai: "0900000000", quocTich: "USA", soHoChieu: "VSLD0511", loaiNgayThangNamSinh: "Y", thoiHanTamTruStr: "23:59:59 30/11/2026", unexpectedField: "invalid" };
  const domestic = formatKbttDraftForProvider(mixed, "VIETNAMESE");
  for (const key of ["quocTich", "soHoChieu", "loaiNgayThangNamSinh", "thoiHanTamTruStr"]) assert.equal(Object.hasOwn(domestic, key), false);
  assert.equal(domestic.soGiayTo, mixed.soGiayTo);
  const foreign = formatKbttDraftForProvider(mixed, "FOREIGN");
  for (const key of ["soGiayTo", "loaiGiayTo", "lyDoCuTru", "diaChi", "soDienThoai"]) assert.equal(Object.hasOwn(foreign, key), false);
  assert.equal(foreign.quocTich, "USA");
  assert.equal(foreign.loaiNgayThangNamSinh, "Y");
  assert.equal(foreign.thoiHanTamTruStr, "2026-11-30 23:59:59");
  assert.equal(foreign.unexpectedField, "invalid");
  assert.equal(domestic.unexpectedField, "invalid");
  assert.equal(mixed.diaChi, "Synthetic address");
});


test("BCA submit distinguishes immediate dispatch from failed, uncertain, and legacy unsent results", () => {
  for (const status of ["SUBMITTED"]) {
    assert.equal(getKbttSubmissionIssue({ status, providerMessage: null }), null);
  }
  for (const status of ["DRAFT", "READY", "FAILED", "UNKNOWN", "CANCELLED"]) {
    assert.equal(typeof getKbttSubmissionIssue({ status, providerMessage: null }), "string");
  }
  assert.equal(getKbttSubmissionIssue({ status: "FAILED", providerMessage: "Luồng gửi BCA đang tạm dừng." }), "Luồng gửi BCA đang tạm dừng.");
  assert.match(getKbttSubmissionIssue({ status: "UNKNOWN", providerMessage: null }), /đối soát/);
  assert.equal(getKbttSubmissionIssue({ status: "FAILED", providerMessage: "password=secret" }), kbttErrorMessage(null));
});

test("BCA submission handlers keep feedback in place without confirmation or notification popups", () => {
  const source = readFileSync(new URL("./components/kbtt-declarations-page.tsx", import.meta.url), "utf8");
  const listHandlers = source.slice(source.indexOf("  const handleSubmitAll ="), source.indexOf("  const handleViewError ="));
  const modalHandler = source.slice(source.indexOf("  const handleSubmit = async"), source.indexOf("  const isBusy ="));
  assert.ok(listHandlers.length > 0 && modalHandler.length > 0);
  const parsed = ts.createSourceFile("kbtt-declarations-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics, [], "Silent submit handlers must preserve valid TSX");
  for (const handler of [listHandlers, modalHandler]) {
    assert.doesNotMatch(handler, /showConfirmDialog|showSuccessAlert|showErrorAlert|showWarningAlert/);
    assert.match(handler, /getKbttSubmissionIssue/);
  }
  assert.match(listHandlers, /setSubmissionIssues/);
  assert.match(modalHandler, /setSubmissionError/);
  assert.match(source, /role="alert"[\s\S]*?submissionError/);
});

test("KBTT connection accepts a safe profile, preserves profile failures and defaults legacy responses", () => {
  const base = {
    configured: true, status: "CONNECTED", maskedUsername: "o***r", csltId: "123",
    lastCheckedAt: null, lastConnectedAt: null, lastErrorCode: null, lastErrorMessage: null,
  };
  assert.deepEqual(kbttConnectionSchema.parse(base).providerProfile, {
    state: "NOT_LOADED", accommodation: null, fetchedAt: null, error: null,
  });
  const accommodation = {
    name: "Cơ sở mẫu", address: "Địa chỉ mẫu", representative: null,
    phone: null, email: null, managingUnit: "Đơn vị mẫu", accessToken: "must-not-return",
  };
  const result = kbttConnectionSchema.parse({ ...base, providerProfile: {
    state: "READY", accommodation, fetchedAt: "2026-11-16T01:00:00.000Z", error: null,
    refreshToken: "must-not-return",
  } });
  assert.equal(result.providerProfile.accommodation.name, "Cơ sở mẫu");
  assert.equal("accessToken" in result.providerProfile.accommodation, false);
  assert.equal("refreshToken" in result.providerProfile, false);
  const error = { code: "KBTT_PROVIDER_UNAVAILABLE", message: "Không đọc được thông tin cơ sở." };
  const failed = kbttConnectionSchema.parse({ ...base, providerProfile: {
    state: "FAILED", accommodation: null, fetchedAt: null, error,
  } });
  assert.equal(failed.status, "CONNECTED");
  assert.deepEqual(failed.providerProfile.error, error);
  assert.equal(kbttConnectionSchema.safeParse({ ...base, providerProfile: {
    ...result.providerProfile, accommodation: { ...accommodation, name: 123 },
  } }).success, false);
});

test("KBTT fixed 12:00/21:00 slots, 10-minute catch-up boundary, retired custom autoSubmitTime, and temporary disconnect states", () => {
  // Rejects non-null autoSubmitTime (custom time picking is retired)
  for (const invalidTime of ["04:30", "12:00", "21:00", "24:00", ""]) {
    assert.equal(
      kbttAutoSubmitConfigSchema.safeParse({
        autoSubmitEnabled: true,
        autoSubmitTime: invalidTime,
      }).success,
      false,
    );
  }
  assert.deepEqual(
    kbttAutoSubmitConfigSchema.parse({ autoSubmitEnabled: true }),
    { autoSubmitEnabled: true },
  );

  // Fixed system schedule slots (12:00 and 21:00 Asia/Ho_Chi_Minh)
  assert.deepEqual(KBTT_FIXED_SCHEDULE_SLOTS, ["12:00", "21:00"]);
  assert.equal(KBTT_SCHEDULE_TIMEZONE, "Asia/Ho_Chi_Minh");

  // computeNextVietnamDailySlot
  assert.deepEqual(
    computeNextVietnamDailySlot(new Date("2026-11-18T03:00:00.000Z")), // 10:00 VN
    {
      slot: "12:00",
      scheduledAt: "2026-11-18T05:00:00.000Z",
      dateStr: "2026-11-18",
      isTomorrow: false,
    },
  );
  assert.deepEqual(
    computeNextVietnamDailySlot(new Date("2026-11-18T06:00:00.000Z")), // 13:00 VN
    {
      slot: "21:00",
      scheduledAt: "2026-11-18T14:00:00.000Z",
      dateStr: "2026-11-18",
      isTomorrow: false,
    },
  );
  assert.deepEqual(
    computeNextVietnamDailySlot(new Date("2026-11-18T15:00:00.000Z")), // 22:00 VN
    {
      slot: "12:00",
      scheduledAt: "2026-11-19T05:00:00.000Z",
      dateStr: "2026-11-19",
      isTomorrow: true,
    },
  );

  // computeNextVietnamTenMinuteCatchUp (12:07 -> 12:10, 21:03 -> 21:10, 12:10:00 -> 12:20, midnight rollover -> null)
  assert.deepEqual(
    computeNextVietnamTenMinuteCatchUp(new Date("2026-11-18T05:07:15.000Z")), // 12:07:15 VN
    {
      scheduledAt: "2026-11-18T05:10:00.000Z",
      timeStr: "12:10",
      dateStr: "2026-11-18",
    },
  );
  assert.deepEqual(
    computeNextVietnamTenMinuteCatchUp(new Date("2026-11-18T14:03:00.000Z")), // 21:03:00 VN
    {
      scheduledAt: "2026-11-18T14:10:00.000Z",
      timeStr: "21:10",
      dateStr: "2026-11-18",
    },
  );
  assert.deepEqual(
    computeNextVietnamTenMinuteCatchUp(new Date("2026-11-18T05:10:00.000Z")), // 12:10:00 VN -> strictly future 12:20
    {
      scheduledAt: "2026-11-18T05:20:00.000Z",
      timeStr: "12:20",
      dateStr: "2026-11-18",
    },
  );
  assert.equal(
    computeNextVietnamTenMinuteCatchUp(new Date("2026-11-18T16:55:00.000Z")), // 23:55:00 VN -> crosses midnight
    null,
  );
  assert.equal(getVietnamCalendarDate("2026-11-18T16:55:00.000Z"), "2026-11-18");

  // Connection page removes custom time picker and distinguishes temporary disconnect vs login required
  const connectionPageSrc = readFileSync(
    new URL("./components/kbtt-connection-page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(connectionPageSrc, /type="time"|Lưu giờ gửi/);
  assert.match(connectionPageSrc, /KBTT_FIXED_SCHEDULE_SLOTS/);
  assert.match(connectionPageSrc, /nextScheduledSlotAt/);
  assert.match(connectionPageSrc, /nextCatchUpAt/);
  assert.match(connectionPageSrc, /Đang thử kết nối lại sau 10 giây/);
  assert.match(connectionPageSrc, /Tạm ngắt kết nối BCA — đang chờ kết nối lại/);
  assert.match(connectionPageSrc, /Cần đăng nhập lại BCA/);

  // Per-record status/detail distinctions in kbtt-declarations-page.tsx and in-house-declaration-cells.tsx
  const declPageSrc = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(declPageSrc, /ELIGIBLE_SAME_DAY/);
  assert.match(declPageSrc, /Hẹn gửi bù/);
  assert.match(declPageSrc, /PRIOR_DAY_MANUAL/);
  assert.match(declPageSrc, /Quá ngày — gửi thủ công/);
  assert.match(declPageSrc, /KBTT_TEMP_DISCONNECTED/);
  assert.match(declPageSrc, /Chờ kết nối BCA/);
  assert.match(declPageSrc, /KBTT_SESSION_ENDED/);
  assert.match(declPageSrc, /Cần đăng nhập lại BCA/);
  assert.match(declPageSrc, /NEEDS_CORRECTION/);
  assert.match(declPageSrc, /RECONCILIATION_REQUIRED/);

  const cellsSrc = readFileSync(
    new URL("./components/in-house-declaration-cells.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cellsSrc, /getReconciliationRowStatusBadge/);
  assert.match(cellsSrc, /PRIOR_DAY_MANUAL/);
  assert.match(cellsSrc, /KBTT_TEMP_DISCONNECTED/);
  assert.match(cellsSrc, /KBTT_SESSION_ENDED/);
  assert.match(cellsSrc, /RECONCILIATION_REQUIRED/);
});

test("BCA-06: connection recovery polling stays active during temporary disconnect cooldown and stops cleanly on terminal states", () => {
  const hookSource = readFileSync(
    new URL("./hooks/use-kbtt-connection.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(hookSource, {
    fileName: "use-kbtt-connection.ts",
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;

  let queryOptions;
  let currentConnectionData;
  const invalidatedOps = [];
  const effects = [];
  const refs = [];
  let refCursor = 0;

  const mockResource = {
    queries: {
      connection: { options: () => ({ queryKey: ["connection"] }) },
      declarations: { invalidateAll: () => invalidatedOps.push("declarations") },
      inHouseDeclarations: { invalidateAll: () => invalidatedOps.push("inHouseDeclarations") },
      autoSubmitConfig: { invalidateAll: () => invalidatedOps.push("autoSubmitConfig") },
    },
    mutations: {
      connect: { options: () => ({}) },
      check: { options: () => ({}) },
      disconnect: { options: () => ({}) },
    },
  };

  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => {
      if (name === "react") {
        return {
          useCallback: (fn) => fn,
          useMemo: (fn) => fn(),
          useRef: (initial) => {
            if (!refs[refCursor]) refs[refCursor] = { current: initial };
            return refs[refCursor++];
          },
          useEffect: (fn) => effects.push(fn),
        };
      }
      if (name === "@tanstack/react-query") {
        return {
          useQueryClient: () => ({}),
          useQuery: (opts) => {
            queryOptions = opts;
            return { isSuccess: true, isPending: false, isFetching: false, data: currentConnectionData };
          },
          useMutation: () => ({ isPending: false, mutateAsync: async () => ({}), reset: () => {} }),
        };
      }
      if (name.includes("kbtt-resource")) {
        return { kbttResource: { bind: () => mockResource } };
      }
      throw new Error(`Unexpected import ${name}`);
    },
    module,
    module.exports,
  );

  const {
    shouldPollKbttConnectionRecovery,
    getKbttConnectionStatusInfo,
    useKbttConnection,
  } = module.exports;

  const nowMs = Date.parse("2026-11-18T05:00:00.000Z");

  // 1. KBTT_RETRY_PENDING -> polls at 10_000ms
  assert.equal(
    shouldPollKbttConnectionRecovery(
      { configured: true, status: "DISCONNECTED", lastErrorCode: "KBTT_RETRY_PENDING" },
      nowMs,
    ),
    10_000,
  );

  // 2. KBTT_TEMP_DISCONNECTED with future cooldown -> bounded poll [5_000, 15_000]
  assert.equal(
    shouldPollKbttConnectionRecovery(
      {
        configured: true,
        status: "DISCONNECTED",
        lastErrorCode: "KBTT_TEMP_DISCONNECTED",
        cooldownUntil: "2026-11-18T05:00:08.000Z",
      },
      nowMs,
    ),
    9_000,
  );
  assert.equal(
    shouldPollKbttConnectionRecovery(
      {
        configured: true,
        status: "DISCONNECTED",
        lastErrorCode: "KBTT_TEMP_DISCONNECTED",
        cooldownUntil: "2026-11-18T05:00:55.000Z",
      },
      nowMs,
    ),
    15_000,
  );
  assert.equal(
    shouldPollKbttConnectionRecovery(
      {
        configured: true,
        status: "DISCONNECTED",
        lastErrorCode: "KBTT_TEMP_DISCONNECTED",
        cooldownUntil: null,
      },
      nowMs,
    ),
    15_000,
  );

  // 3. Stops polling on terminal states
  for (const terminal of [
    { configured: true, status: "CONNECTED", lastErrorCode: null },
    { configured: true, status: "AUTH_FAILED", lastErrorCode: "KBTT_AUTH_FAILED" },
    { configured: true, status: "DISCONNECTED", lastErrorCode: "KBTT_SESSION_ENDED" },
    { configured: true, status: "DISCONNECTED", lastErrorCode: "KBTT_FACILITY_CONFLICT" },
    { configured: false, status: "DISCONNECTED", lastErrorCode: "KBTT_TEMP_DISCONNECTED" },
  ]) {
    assert.equal(shouldPollKbttConnectionRecovery(terminal, nowMs), false);
  }

  // 4. Status info distinguishes KBTT_FACILITY_CONFLICT, TEMP_DISCONNECTED, RETRY_PENDING, LOGIN_REQUIRED
  const conflictInfo = getKbttConnectionStatusInfo({
    configured: true,
    status: "DISCONNECTED",
    lastErrorCode: "KBTT_FACILITY_CONFLICT",
    lastErrorMessage: null,
  });
  assert.equal(conflictInfo.state, "FACILITY_CONFLICT");
  assert.equal(conflictInfo.badgeLabel, "Trùng cơ sở lưu trú BCA");
  assert.equal(conflictInfo.isFacilityConflict, true);
  assert.equal(conflictInfo.isTemporaryDisconnect, false);
  assert.match(conflictInfo.message, /liên kết với một khách sạn khác/);

  // 5. Recovery transition invalidates local queries once without render loop
  const runRender = (connData) => {
    currentConnectionData = connData;
    refCursor = 0;
    effects.length = 0;
    useKbttConnection("hotel-1");
    for (const effect of effects) effect();
  };

  runRender({
    configured: true,
    status: "DISCONNECTED",
    lastErrorCode: "KBTT_RETRY_PENDING",
  });
  assert.equal(queryOptions.refetchIntervalInBackground, false);
  assert.deepEqual(invalidatedOps, []);

  runRender({
    configured: true,
    status: "DISCONNECTED",
    lastErrorCode: "KBTT_TEMP_DISCONNECTED",
    cooldownUntil: "2026-11-18T05:01:00.000Z",
  });
  assert.deepEqual(invalidatedOps, []);

  // Transition to CONNECTED -> invalidates once
  runRender({
    configured: true,
    status: "CONNECTED",
    lastErrorCode: null,
    cooldownUntil: null,
  });
  assert.deepEqual(invalidatedOps, [
    "declarations",
    "inHouseDeclarations",
    "autoSubmitConfig",
  ]);

  // Subsequent renders in CONNECTED do not re-trigger invalidations
  runRender({
    configured: true,
    status: "CONNECTED",
    lastErrorCode: null,
    cooldownUntil: null,
  });
  assert.equal(invalidatedOps.length, 3);
});
