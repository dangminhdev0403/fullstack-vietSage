import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canSelectKbttDeclaration,
  formatKbttDraftForDisplay,
  formatKbttDraftForProvider,
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

  const pageSource = readFileSync(
    new URL("./components/kbtt-declarations-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pageSource, /saveMutation\.mutateAsync/);
  assert.match(pageSource, /submitMutation\.mutateAsync/);
  assert.match(pageSource, /Gửi lên Bộ Công an/);
  assert.match(pageSource, /HH:mm:ss DD\/MM\/YYYY/);
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
