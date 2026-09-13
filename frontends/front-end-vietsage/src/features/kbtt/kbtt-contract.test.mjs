import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canRetryDeclaration,
  canSubmitDeclaration,
  getRowPartitionTab,
  KBTT_FORBIDDEN_KEYS,
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
  saveKbttDraftPayloadSchema,
} from "./types/kbtt-contract.ts";
import { buildWorkspaceNavigation } from "../workspace/config/workspace-registry.ts";

test("KBTT validates write-only credentials, strips secret fields, preserves password whitespace, sanitizes errors, and scopes owner navigation", () => {
  const credentials = kbttCredentialsSchema.parse({ username: " owner ", password: " password " });
  assert.deepEqual(credentials, { username: "owner", password: " password " });
  const spaced = kbttCredentialsSchema.parse({ username: " demo tich hop ", password: " my_secret " });
  assert.deepEqual(spaced, { username: "demotichhop", password: " my_secret " });
  for (const input of [
    { username: " ", password: "password" },
    { username: "owner", password: "" },
    { username: "x".repeat(121), password: "password" },
    { username: "owner", password: "x".repeat(257) },
    { username: "owner", password: "password", tenantId: "another-tenant" },
  ]) assert.equal(kbttCredentialsSchema.safeParse(input).success, false);

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
  for (const field of ["password", "accessToken", "refreshToken", "ciphertext"]) {
    assert.equal(field in connection, false);
  }
  assert.equal(kbttErrorCode({ data: { code: "KBTT_AUTH_FAILED" } }), "KBTT_AUTH_FAILED");
  assert.equal(kbttErrorCode({ error: { code: "KBTT_PROVIDER_UNAVAILABLE" } }), "KBTT_PROVIDER_UNAVAILABLE");
  assert.equal(kbttErrorCode({ message: "password=do-not-render" }), null);
  assert.equal(kbttErrorCode({ code: "constructor" }), null);
  assert.equal(kbttErrorMessage("password=do-not-render"), kbttErrorMessage(null));
  assert.equal(kbttErrorMessage("KBTT_AUTH_FAILED"), "Tài khoản hoặc mật khẩu không đúng. Vui lòng đăng nhập lại.");

  for (const permission of ["hotel.kbtt.view", "hotel.kbtt.manage", "hotel.dashboard.view"]) {
    const entry = buildWorkspaceNavigation({ persona: "owner", permissions: [permission], hotelId: "hotel-1" }).find(
      (item) => item.key === "owner.hotel.kbtt",
    );
    assert.equal(entry?.label, "Khai báo tạm trú Bộ Công an");
    assert.equal(entry?.href, "/owner/hotels/hotel-1/kbtt");
  }
  for (const scope of [
    { persona: "owner", permissions: ["hotel.kbtt.view"] },
    { persona: "owner", permissions: [], hotelId: "hotel-1" },
    { persona: "front_desk", permissions: ["hotel.kbtt.view"], hotelId: "hotel-1" },
  ]) {
    assert.equal(buildWorkspaceNavigation(scope).some((item) => item.key === "owner.hotel.kbtt"), false);
  }
  const staffEntry = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.kbtt.declarations.view"],
    hotelId: "hotel-1",
  }).find((item) => item.key === "staff.kbtt");
  assert.equal(staffEntry?.href, "/hotels/hotel-1/kbtt");
  assert.equal(
    buildWorkspaceNavigation({ persona: "front_desk", permissions: [], hotelId: "hotel-1" })
      .some((item) => item.key === "staff.kbtt"),
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
      citizenshipKind: "FOREIGN",
      derivedStatus: "READY",
      declaration: {
        ...sampleVietnameseRow.declaration,
        id: "decl-2",
        declarationKind: "FOREIGN",
        status: "READY",
      },
    },
    {
      ...sampleVietnameseRow,
      occupantId: "occ-3",
      citizenshipKind: null,
      derivedStatus: "MISSING_PROFILE",
      declaration: null,
    },
    {
      ...sampleVietnameseRow,
      occupantId: "occ-4",
      derivedStatus: "SUBMITTED",
      declaration: {
        ...sampleVietnameseRow.declaration,
        id: "decl-4",
        status: "SUBMITTED",
        submittedAt: "2026-09-13T11:00:00.000Z",
      },
    },
    {
      ...sampleVietnameseRow,
      occupantId: "occ-5",
      derivedStatus: "FAILED",
      declaration: {
        ...sampleVietnameseRow.declaration,
        id: "decl-5",
        status: "FAILED",
        providerMessage: "Thông tin giấy tờ không khớp",
      },
    },
  ];

  const parsedList = kbttDeclarationListSchema.parse(sampleList);
  assert.equal(parsedList.length, 5);

  // Four-tab exact partition tests
  assert.equal(getRowPartitionTab(parsedList[0]), "vietnamese"); // VIETNAMESE, DRAFT
  assert.equal(getRowPartitionTab(parsedList[1]), "foreign"); // FOREIGN, READY
  assert.equal(getRowPartitionTab(parsedList[2]), "needs_completion"); // MISSING_PROFILE
  assert.equal(getRowPartitionTab(parsedList[3]), "submitted_or_error"); // SUBMITTED
  assert.equal(getRowPartitionTab(parsedList[4]), "submitted_or_error"); // FAILED
  assert.equal(getRowPartitionTab({ derivedStatus: "SENDING", citizenshipKind: "VIETNAMESE" }), "submitted_or_error");
  assert.equal(getRowPartitionTab({ derivedStatus: "UNKNOWN", citizenshipKind: "FOREIGN" }), "submitted_or_error");
  assert.equal(getRowPartitionTab({ derivedStatus: "CANCELLED", citizenshipKind: "VIETNAMESE" }), "submitted_or_error");
  assert.equal(getRowPartitionTab({ derivedStatus: "DRAFT", citizenshipKind: null }), "needs_completion");

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
  assert.equal(saveKbttDraftPayloadSchema.safeParse(validVietnameseDraft).success, true);

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
  assert.equal(saveKbttDraftPayloadSchema.safeParse(validForeignDraft).success, true);

  // Declaration record schema parse
  const parsedRecord = kbttDeclarationRecordSchema.parse(detailData.declaration);
  assert.equal(parsedRecord.id, "decl-1");
});

test("KBTT explicit declaration submit contract, BFF endpoint, resource, button fencing, UNKNOWN protection, and error sanitization", () => {
  // 1. Button visibility and permissions policy (canSubmitDeclaration)
  assert.equal(canSubmitDeclaration("READY", true), true, "READY + canManage must allow submit");
  assert.equal(canSubmitDeclaration("READY", false), false, "READY without canManage must not allow submit");
  for (const status of [
    "DRAFT",
    "MISSING_PROFILE",
    "SUBMITTED",
    "SENDING",
    "UNKNOWN",
    "FAILED",
    "CANCELLED",
    null,
    undefined,
  ]) {
    assert.equal(
      canSubmitDeclaration(status, true),
      false,
      `Status ${status} must not allow 'Gửi BCA'`,
    );
    assert.equal(
      canSubmitDeclaration(status, false),
      false,
      `Status ${status} without canManage must not allow 'Gửi BCA'`,
    );
  }

  // 2. UNKNOWN fencing and FAILED retry policy (canRetryDeclaration)
  // UNKNOWN must NEVER offer retry under any condition
  assert.equal(canRetryDeclaration("UNKNOWN", true), false, "UNKNOWN must NEVER offer retry");
  assert.equal(canRetryDeclaration("UNKNOWN", false), false, "UNKNOWN must NEVER offer retry");
  assert.equal(canRetryDeclaration("SUBMITTED", true), false);
  assert.equal(canRetryDeclaration("SENDING", true), false);
  assert.equal(canRetryDeclaration("READY", true), false);
  assert.equal(canRetryDeclaration("DRAFT", true), false);
  assert.equal(canRetryDeclaration("MISSING_PROFILE", true), false);
  assert.equal(canRetryDeclaration("CANCELLED", true), false);

  // FAILED may show retry only if canManage is true
  assert.equal(canRetryDeclaration("FAILED", true), true, "FAILED with canManage allows retry");
  assert.equal(canRetryDeclaration("FAILED", false), false, "FAILED without canManage must not allow retry");

  // 3. Error sanitization / secret exposure prevention (sanitizeErrorMessage)
  assert.equal(
    sanitizeErrorMessage("password=123456"),
    "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
  );
  assert.equal(
    sanitizeErrorMessage("Bearer secret-token-xyz"),
    "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
  );
  assert.equal(
    sanitizeErrorMessage("providerResponseJson: { data: 'leaked' }"),
    "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
  );
  assert.equal(
    sanitizeErrorMessage('{"status":"error","token":"secret"}'),
    "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
  );
  assert.equal(
    sanitizeErrorMessage("KBTT_AUTH_FAILED"),
    "Tài khoản hoặc mật khẩu không đúng. Vui lòng đăng nhập lại.",
  );
  assert.equal(
    sanitizeErrorMessage(null),
    "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
  );

  // 4. BFF Action Route contract verification
  const routeSource = readFileSync(
    new URL(
      "../../app/api/hotel-ops/hotels/[hotelId]/kbtt/declarations/[occupantId]/[action]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  // Route schema allows "submit"
  assert.match(routeSource, /action:\s*z\.enum\(\[\s*"draft",\s*"ready",\s*"submit",\s*"detail"\s*\]\)/);
  // Route POST handler supports submit action and calls backend submit endpoint
  assert.match(routeSource, /action\s*!==\s*"ready"\s*&&\s*action\s*!==\s*"submit"/);
  assert.match(routeSource, /executeHotelOpsBackendRequest/);
  assert.match(routeSource, /kbttDeclarationRecordSchema\.parse/);

  // 5. Repository contract verification
  const repositorySource = readFileSync(
    new URL("./repositories/kbtt-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repositorySource, /submit\s*\([\s\S]*?hotelId:\s*string[\s\S]*?occupantId:\s*string[\s\S]*?\)/);
  assert.match(repositorySource, /\/submit/);
  assert.match(repositorySource, /method:\s*"POST"/);
  assert.match(repositorySource, /kbttDeclarationRecordSchema\.parse/);

  // 6. Resource mutation contract verification
  const resourceSource = readFileSync(
    new URL("./resources/kbtt-resource.ts", import.meta.url),
    "utf8",
  );
  assert.match(resourceSource, /submit:\s*defineMutation\(\{/);
  assert.match(resourceSource, /defaults:\s*\{\s*retry:\s*false,\s*networkMode:\s*"always"\s*\}/);
  assert.match(resourceSource, /kbttRepository\.submit\(scope\.hotelId,\s*variables\.occupantId\)/);
  assert.match(resourceSource, /invalidates:\s*declarationInvalidates/);

  // 7. UI: Destructive confirmation, button wording, no auto-submit, preserved save/markReady
  const pageSource = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );
  // Button says "Gửi BCA"
  assert.match(pageSource, /Gửi BCA\s*<\/button>/);
  // Gửi BCA is gated by canSubmitDeclaration
  assert.match(pageSource, /canSubmitDeclaration\(occupant\.derivedStatus,\s*canManage\)/);
  assert.match(pageSource, /canSubmitDeclaration\(declStatus,\s*canManage\)/);
  // Retry for FAILED is gated by canRetryDeclaration
  assert.match(pageSource, /canRetryDeclaration\(declStatus,\s*canManage\)/);
  assert.match(pageSource, /Thử lại gửi BCA/);
  // Destructive-style confirmation states real guest data is sent to Bộ Công an demo/provider
  assert.match(pageSource, /Bộ Công an demo\/provider/);
  assert.match(pageSource, /dữ liệu thực/);
  // Disabled while pending (isBusy / submittingOccupantId)
  assert.match(pageSource, /disabled=\{isBusy\}/);
  assert.match(pageSource, /disabled=\{submittingOccupantId === occupant\.occupantId\}/);
  // UNKNOWN fencing notice exists and prevents submit
  assert.match(pageSource, /declStatus === "UNKNOWN"/);
  // Save and markReady behavior preserved
  assert.match(pageSource, /Lưu bản nháp/);
  assert.match(pageSource, /Đánh dấu sẵn sàng/);
  assert.match(pageSource, /handleSaveDraft/);
  assert.match(pageSource, /handleMarkReady/);
  // No auto-submit: submitMutation.mutateAsync is only called in explicit user handlers
  assert.doesNotMatch(pageSource, /useEffect\(\s*\(\)\s*=>\s*\{[^}]*submitMutation/);
});

