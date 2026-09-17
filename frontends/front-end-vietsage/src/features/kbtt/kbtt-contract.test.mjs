import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canSelectKbttDeclaration,
  formatKbttDraftForDisplay,
  formatKbttDraftForProvider,
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
  kbttDeclarationRecordSchema,
  kbttErrorCode,
  kbttErrorMessage,
  kbttOccupantDeclarationDetailSchema,
  sanitizeErrorMessage,
  sanitizeProviderDetail,
  saveKbttDraftPayloadSchema,
} from "./types/kbtt-contract.ts";
import { buildWorkspaceNavigation } from "../workspace/config/workspace-registry.ts";

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
    maskedUsername: "o***r",
    csltId: "123",
    csltKhuVuc: null,
    csltDonVi: null,
    maTTCuaCslt: null,
    maPxCuaCslt: null,
    isCsltChinh: null,
    lastCheckedAt: null,
    lastConnectedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    password: "must-not-return",
    accessToken: "must-not-return",
    refreshToken: "must-not-return",
    ciphertext: "must-not-return",
  });
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
    }).find((item) => item.key === "owner.hotel.kbtt");
    assert.equal(entry?.label, "Khai báo tạm trú Bộ Công an");
    assert.equal(entry?.href, "/owner/hotels/hotel-1/kbtt");
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
  }).find((item) => item.key === "staff.kbtt");
  assert.equal(staffEntry?.href, "/hotels/hotel-1/kbtt");
  assert.equal(
    buildWorkspaceNavigation({
      persona: "front_desk",
      permissions: [],
      hotelId: "hotel-1",
    }).some((item) => item.key === "staff.kbtt"),
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
  assert.match(pageSource, /aria-label="Giới tính bắt buộc"/);
  assert.match(pageSource, /aria-label="Ngày sinh bắt buộc"/);
  assert.match(pageSource, /aria-label="Loại giấy tờ bắt buộc"/);
  assert.match(pageSource, /Tên khách phòng/);
  assert.doesNotMatch(pageSource, /Trường bắt buộc để gửi BCA/);
  assert.doesNotMatch(
    pageSource,
    /Chỉnh sửa hàng loạt|Bấm để chỉnh sửa chi tiết/,
  );
  assert.match(pageSource, /Gửi lên Bộ Công an/);
  assert.match(pageSource, /Hồ sơ của lần lưu trú này đã gửi BCA/);
  assert.match(pageSource, /[" >]Xem(?: chi tiết)?[" <]/);
  assert.match(pageSource, /handleSubmitAll/);
  assert.doesNotMatch(
    pageSource,
    /type="checkbox"|selectedOccupantIds|handleSubmitSelected|Upload BCA đã chọn/,
  );
  assert.match(pageSource, /disabled=\{!isSelectable \|\| isSubmittingBatch\}/);
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
    autoSubmitTime: "04:30",
  });
  assert.deepEqual(validConfig, {
    autoSubmitEnabled: true,
    autoSubmitTime: "04:30",
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
    autoSubmitTime: "04:30",
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
    autoSubmitTime: "04:30",
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

test("KBTT declarations page Upload tất cả executes concurrent Promise.allSettled and aggregates results", () => {
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

  // Must preserve error formatting and final summary modal
  assert.match(
    handleSubmitAllBlock,
    /status === "fulfilled"/,
    "Must count fulfilled items",
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
    /Lưu vào (?:CSDL|DB)/,
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

test("KBTT declarations page stops countdown and auto-push when hotel is not logged in to BCA", () => {
  const pageSource = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );

  // Must consume useKbttConnection and derive isConnected
  assert.match(
    pageSource,
    /useKbttConnection\s*\(\s*hotelId\s*\)/,
    "Must invoke useKbttConnection with hotelId",
  );
  assert.match(
    pageSource,
    /isConnected\s*=\s*connectionData\?\.status\s*===\s*"CONNECTED"/,
    "Must derive isConnected from connection status",
  );

  // Countdown synchronization must reset/pause when not connected
  assert.match(
    pageSource,
    /!IS_AUTO_SUBMIT_ENABLED\s*\|\|\s*!isConnected/,
    "Countdown must reset when not connected",
  );

  // executeAutoSubmitNow must guard against execution when not connected
  assert.match(
    pageSource,
    /const executeAutoSubmitNow = useCallback\(async \(\) => {[\s\S]*?if \(!isConnected\) return;/,
    "executeAutoSubmitNow must bail out if not connected",
  );

  // Banner must render warning when not connected
  assert.match(
    pageSource,
    /Chưa đăng nhập Cổng BCA/,
    "Must render notice badge when not connected to BCA",
  );
  assert.match(
    pageSource,
    /Tự động gửi BCA đang tắt/,
    "Must state auto-submit is turned off when not logged in",
  );
});


