import { KbttStaySyncService } from "../application/kbtt-stay-sync.service";
import {
  departurePayload,
  providerIdentity,
} from "../domain/kbtt-stay-sync";
import { KbttProviderClient } from "../infrastructure/kbtt-provider.client";
import { KbttRepository } from "../infrastructure/kbtt.repository";
import { KbttStayRepository } from "../infrastructure/kbtt-stay.repository";

const originalGuest = {
  hoTen: "Nguyen Van An",
  soGiayTo: "001122334455",
  loaiGiayTo: 1,
  ngayDenCsltStr: "2026-11-01 14:00:00",
  ngayDiDuKienStr: "2026-11-04 14:00:00",
};

describe("BCA stay synchronization helpers", () => {
  it("qualifies identities by domestic document type and foreign nationality", () => {
    const keys = [
      providerIdentity("VIETNAMESE", { soGiayTo: "123456789012", loaiGiayTo: 1 })?.key,
      providerIdentity("VIETNAMESE", { soGiayTo: "123456789012", loaiGiayTo: 8 })?.key,
      providerIdentity("FOREIGN", { soHoChieu: "A1234567", quocTich: "RUS" })?.key,
      providerIdentity("FOREIGN", { soHoChieu: "A1234567", quocTich: "USA" })?.key,
    ];
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(4);
    expect(providerIdentity("FOREIGN", {
      soHoChieu: " a1234567 ", quocTich: "rus",
    })?.key).toBe(keys[2]);
  });

  it("builds domestic TS using acknowledged identity and no date fields", () => {
    expect(departurePayload("VIETNAMESE", originalGuest, "TS", new Date("2026-11-10T07:00:00Z")))
      .toEqual({ loai: "TS", soGiayTo: "001122334455", loaiGiayTo: 1 });
  });

  it("builds foreign TS using soHc and no hotel or residence date", () => {
    expect(departurePayload("FOREIGN", {
      soHoChieu: "A1234567",
      quocTich: "RUS",
      thoiHanTamTruStr: "2026-12-01 14:00:00",
    }, "TS", new Date("2026-11-10T07:00:00Z"))).toEqual({
      loai: "TS", soHc: "A1234567", quocTich: "RUS",
    });
  });

  it("builds domestic GH with the confirmed departure in Vietnam time", () => {
    expect(departurePayload("VIETNAMESE", originalGuest, "GH", new Date("2026-11-10T07:00:00Z")))
      .toEqual({
        loai: "GH", soGiayTo: "001122334455", loaiGiayTo: 1,
        thoiGianStr: "2026-11-10 14:00:00",
      });
  });

  it("maps foreign residence validity independently from the hotel departure", () => {
    expect(departurePayload("FOREIGN", {
      soHoChieu: "A1234567",
      quocTich: "RUS",
      thoiHanTamTruStr: "2026-12-01 14:00:00",
    }, "GH", new Date("2026-11-10T07:00:00Z"))).toEqual({
      loai: "GH",
      soHc: "A1234567",
      quocTich: "RUS",
      thoiGianStr: "2026-11-10 14:00:00",
      thoiHanTamTruVnStr: "2026-12-01 14:00:00",
    });
  });


});

function fixture() {
  const declaration = {
    id: "declaration-1",
    stayId: "stay-1",
    declarationKind: "VIETNAMESE" as "VIETNAMESE" | "FOREIGN",
    status: "SUBMITTED",
    submittedCsltId: "cslt-1" as string | null,
    submittedPayloadJson: [{ ...originalGuest }] as Array<Record<string, unknown>> | null,
    draftPayloadJson: { ...originalGuest, soGiayTo: "998877665544", loaiGiayTo: 8 },
    createdAt: new Date("2026-11-01T07:00:00Z"),
    submittedAt: new Date("2026-11-01T07:01:00Z"),
  };
  const stay = {
    id: "stay-1",
    hotelId: "hotel-1",
    status: "CHECKED_OUT",
    checkedInAt: new Date("2026-11-01T07:00:00Z"),
    plannedCheckInAt: new Date("2026-11-01T07:00:00Z"),
    plannedCheckOutAt: new Date("2026-11-10T07:00:00Z"),
    checkedOutAt: new Date("2026-11-05T01:00:00Z") as Date | null,
    room: { roomNumber: "101" },
    occupants: [{
      id: "occupant-1",
      identityNumber: "998877665544",
      kbttGuestDeclarations: [declaration],
    }],
  };
  const operation = {
    id: "operation-1",
    hotelId: stay.hotelId,
    stayId: stay.id,
    occupantId: "occupant-1",
    declarationId: declaration.id,
    declarationKind: declaration.declarationKind,
    sourceEventId: "event-1",
    csltId: "cslt-1",
    identityKey: providerIdentity("VIETNAMESE", originalGuest)!.key,
    kind: "CHECKOUT",
    status: "PENDING",
    wasOverdue: false,
    desiredDepartureAt: null as Date | null,
  };
  const connection = {
    hotelId: stay.hotelId,
    csltId: operation.csltId,
    status: "CONNECTED",
    hotel: { tenantId: "tenant-1" },
  };
  const repository = {
    recoverInterrupted: jest.fn().mockResolvedValue(undefined),
    pendingEvents: jest.fn().mockResolvedValue([]),
    runnable: jest.fn().mockResolvedValue([]),
    materialize: jest.fn().mockResolvedValue(undefined),
    stay: jest.fn().mockResolvedValue(stay),
    update: jest.fn().mockResolvedValue(true),
    acquire: jest.fn().mockResolvedValue("lease-token"),
    renew: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
    declarationsForIdentity: jest.fn().mockResolvedValue([{
      ...declaration,
      stay: { checkedInAt: stay.checkedInAt },
    }]),
    uncertainOperations: jest.fn().mockResolvedValue([]),
    acknowledgedOperations: jest.fn().mockResolvedValue([]),
    closedOperation: jest.fn().mockResolvedValue(null),
    initialDeclaration: jest.fn().mockResolvedValue(null),
    claim: jest.fn().mockResolvedValue(true),
    finish: jest.fn().mockResolvedValue(undefined),
  };
  const declarations = { find: jest.fn().mockResolvedValue(connection) };
  const provider = {
    changeDeparture: jest.fn().mockResolvedValue({ outcome: "SUCCESS", code: "200", message: "Thành công" }),
    submitDeclaration: jest.fn().mockResolvedValue({ outcome: "SUCCESS", code: "200", message: "Thành công" }),
  };
  const resolveSession = jest.fn().mockResolvedValue({ AccessToken: "test-access-token", CsltId: "cslt-1" });
  const service = new KbttStaySyncService(
    repository as unknown as KbttStayRepository,
    declarations as unknown as KbttRepository,
    provider as unknown as KbttProviderClient,
  );
  return { service, repository, declarations, provider, resolveSession, stay, declaration, operation, connection };
}

describe("BCA stay lifecycle delivery", () => {
  const flagNames = [
    "KBTT_STAY_LIFECYCLE_ENABLED",
    "KBTT_AUTO_SUBMIT_LIVE_ENABLED",
    "KBTT_AUTO_SUBMIT_KILL_SWITCH",
  ] as const;
  let originalFlags: Array<string | undefined>;

  beforeEach(() => {
    originalFlags = flagNames.map((name) => process.env[name]);
    process.env.KBTT_STAY_LIFECYCLE_ENABLED = "true";
    process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED = "true";
    delete process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH;
    jest.useFakeTimers().setSystemTime(new Date("2026-11-05T01:00:00Z"));
  });

  afterEach(() => {
    flagNames.forEach((name, index) => {
      const value = originalFlags[index];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
    jest.useRealTimers();
  });

  it.each([
    ["KBTT_STAY_LIFECYCLE_ENABLED", "false"],
    ["KBTT_AUTO_SUBMIT_LIVE_ENABLED", "false"],
    ["KBTT_AUTO_SUBMIT_KILL_SWITCH", "true"],
  ])("performs no repository or provider work when %s=%s", async (flag, value) => {
    process.env[flag] = value;
    const f = fixture();
    await f.service.run(f.resolveSession);
    for (const method of Object.values(f.repository)) expect(method).not.toHaveBeenCalled();
    expect(f.declarations.find).not.toHaveBeenCalled();
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.resolveSession).not.toHaveBeenCalled();
  });

  it("materializes a blocked operation when the initial declaration is still sending", async () => {
    const f = fixture();
    f.declaration.status = "SENDING";
    f.declaration.submittedPayloadJson = null;
    f.declaration.draftPayloadJson = { ...originalGuest };
    f.repository.pendingEvents.mockResolvedValue([{
      id: "event-1",
      eventType: "GUEST_STAY_DEPARTURE_CHANGED",
      aggregateId: f.stay.id,
      hotelId: f.stay.hotelId,
      tenantId: "tenant-1",
      payload: { version: 1, stayId: f.stay.id, wasOverdue: true },
    }]);
    await f.service.run(f.resolveSession);
    expect(f.repository.materialize).toHaveBeenCalledWith(
      "event-1",
      [expect.objectContaining({
        occupantId: "occupant-1",
        declarationId: "declaration-1",
        kind: "EXTEND",
        status: "BLOCKED",
        providerCode: "INITIAL_DECLARATION_PENDING",
      })],
      expect.objectContaining({ prepared: 1, skipped: [] }),
    );
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it.each(["operation", "declaration"])(
    "does not transmit when a prior %s has an unknown outcome",
    async (source) => {
      const f = fixture();
      f.repository.runnable.mockResolvedValue([f.operation]);
      if (source === "operation") {
        f.repository.uncertainOperations.mockResolvedValue([{ id: "previous-operation", status: "UNKNOWN" }]);
      } else {
        f.repository.declarationsForIdentity.mockResolvedValue([{
          ...f.declaration,
          status: "UNKNOWN",
          stay: { checkedInAt: f.stay.checkedInAt },
        }]);
      }
      await f.service.run(f.resolveSession);
      expect(f.repository.update).toHaveBeenCalledWith(
        f.operation.id,
        ["PENDING", "BLOCKED"],
        expect.objectContaining({ status: "BLOCKED", providerCode: "RECONCILIATION_REQUIRED" }),
      );
      expect(f.repository.claim).not.toHaveBeenCalled();
      expect(f.resolveSession).not.toHaveBeenCalled();
      expect(f.provider.changeDeparture).not.toHaveBeenCalled();
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    },
  );

  it.each([null, "cslt-other"])(
    "blocks lifecycle delivery when original declaration provenance is %s",
    async (submittedCsltId) => {
      const f = fixture();
      f.declaration.submittedCsltId = submittedCsltId;
      f.repository.runnable.mockResolvedValue([f.operation]);
      await f.service.run(f.resolveSession);
      expect(f.repository.update).toHaveBeenCalledWith(
        f.operation.id,
        ["PENDING", "BLOCKED"],
        expect.objectContaining({
          status: "BLOCKED",
          providerCode: "DECLARATION_CSLT_REQUIRED",
        }),
      );
      expect(f.repository.claim).not.toHaveBeenCalled();
      expect(f.provider.changeDeparture).not.toHaveBeenCalled();
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    },
  );

  it("blocks a resolved session belonging to another BCA establishment", async () => {
    const f = fixture();
    f.repository.runnable.mockResolvedValue([f.operation]);
    f.resolveSession.mockResolvedValue({
      AccessToken: "test-access-token",
      CsltId: "cslt-other",
    });
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(
      f.operation.id,
      ["PENDING", "BLOCKED"],
      expect.objectContaining({
        status: "BLOCKED",
        providerCode: "CONNECTION_SCOPE_CHANGED",
      }),
    );
    expect(f.repository.claim).not.toHaveBeenCalled();
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it.each(["missing", "different"])(
    "rechecks the current connection before claim and blocks when it is %s",
    async (state) => {
      const f = fixture();
      f.repository.runnable.mockResolvedValue([f.operation]);
      f.declarations.find
        .mockResolvedValueOnce(f.connection)
        .mockResolvedValueOnce(
          state === "missing" ? null : { ...f.connection, csltId: "cslt-other" },
        );
      await f.service.run(f.resolveSession);
      expect(f.declarations.find.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(f.repository.update).toHaveBeenCalledWith(
        f.operation.id,
        ["PENDING", "BLOCKED"],
        expect.objectContaining({ status: "BLOCKED" }),
      );
      expect(f.repository.claim).not.toHaveBeenCalled();
      expect(f.provider.changeDeparture).not.toHaveBeenCalled();
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    },
  );

  it("uses the acknowledged identity for real checkout rather than edited local identity", async () => {
    const f = fixture();
    f.repository.runnable.mockResolvedValue([f.operation]);
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).toHaveBeenCalledWith(
      "VIETNAMESE",
      [{ loai: "TS", soGiayTo: "001122334455", loaiGiayTo: 1 }],
      "test-access-token",
    );
    expect(f.provider.changeDeparture).toHaveBeenCalledTimes(1);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.repository.finish).toHaveBeenCalledWith(
      f.operation.id,
      "lease-token",
      expect.objectContaining({ status: "SUCCEEDED", providerCode: "200" }),
      undefined,
    );
    expect(f.repository.release).toHaveBeenCalledWith("cslt-1", "lease-token");
  });
  function extendingFixture() {
    const f = fixture();
    f.stay.status = "ACTIVE";
    f.stay.checkedOutAt = null;
    f.operation.kind = "EXTEND";
    f.operation.desiredDepartureAt = f.stay.plannedCheckOutAt;
    f.repository.runnable.mockResolvedValue([f.operation]);
    f.repository.acknowledgedOperations.mockResolvedValue([{ kind: "EXTEND", desiredDepartureAt: new Date("2026-11-06T07:00:00Z") }]);
    return f;
  }

  it("sends one GH with the acknowledged identity and confirmed local departure", async () => {
    const f = extendingFixture();
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).toHaveBeenCalledTimes(1);
    expect(f.provider.changeDeparture).toHaveBeenCalledWith("VIETNAMESE", [{
      loai: "GH", soGiayTo: "001122334455", loaiGiayTo: 1,
      thoiGianStr: "2026-11-10 14:00:00",
    }], "test-access-token");
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it.each([
    ["ALREADY_SYNCHRONIZED", "2026-11-10T07:00:00Z", "2026-11-10T07:00:00Z", "SUPERSEDED"],
    ["SHORTENING_UNSUPPORTED", "2026-11-10T07:00:00Z", "2026-11-11T07:00:00Z", "BLOCKED"],
    ["FUTURE_DEPARTURE_REQUIRED", "2026-11-04T00:59:00Z", "2026-11-03T07:00:00Z", "BLOCKED"],
    ["DOMESTIC_30_DAY_LIMIT", "2026-12-02T00:00:00Z", "2026-11-06T07:00:00Z", "BLOCKED"],
  ])("holds or supersedes GH for %s without sending", async (code, desired, previous, status) => {
    const f = extendingFixture();
    f.stay.plannedCheckOutAt = new Date(desired);
    f.operation.desiredDepartureAt = f.stay.plannedCheckOutAt;
    f.repository.acknowledgedOperations.mockResolvedValue([{ kind: "EXTEND", desiredDepartureAt: new Date(previous) }]);
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ status, providerCode: code }));
    expect(f.repository.claim).not.toHaveBeenCalled();
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("accepts the entire domestic 30th calendar day", async () => {
    const f = extendingFixture();
    f.stay.plannedCheckOutAt = new Date("2026-12-01T16:59:59Z");
    f.operation.desiredDepartureAt = f.stay.plannedCheckOutAt;
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).toHaveBeenCalledTimes(1);
  });

  it.each(["changed", "ended", "closed"])("supersedes obsolete delivery when %s", async (state) => {
    const f = extendingFixture();
    if (state === "changed") f.stay.plannedCheckOutAt = new Date("2026-11-11T07:00:00Z");
    if (state === "ended") f.stay.checkedOutAt = new Date();
    if (state === "closed") f.repository.acknowledgedOperations.mockResolvedValue([{ kind: "CHECKOUT" }]);
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ status: "SUPERSEDED", providerCode: {
        changed: "DEPARTURE_CHANGED_AGAIN", ended: "STAY_ENDED", closed: "ALREADY_CLOSED",
      }[state] }));
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("does not send TS before local checkout is confirmed", async () => {
    const f = extendingFixture();
    f.operation.kind = "CHECKOUT";
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "CHECKOUT_NOT_CONFIRMED" }));
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  it.each(["lease", "claim"])("does not transmit when %s cannot be acquired", async (stage) => {
    const f = extendingFixture();
    if (stage === "lease") f.repository.acquire.mockResolvedValue(null);
    else f.repository.claim.mockResolvedValue(false);
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("blocks an expired session without provider delivery or automatic login", async () => {
    const f = extendingFixture();
    f.resolveSession.mockRejectedValue(new Error("Session unavailable"));
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "AUTHENTICATION_REQUIRED" }));
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it.each(["throw", "ambiguous"])("retains UNKNOWN after %s without recovery", async (failure) => {
    const f = extendingFixture();
    f.operation.wasOverdue = true;
    if (failure === "throw") f.provider.changeDeparture.mockRejectedValue(new Error("Network interrupted"));
    else f.provider.changeDeparture.mockResolvedValue({ outcome: "AMBIGUOUS", code: "TIMEOUT", message: "Timeout" });
    await f.service.run(f.resolveSession);
    expect(f.repository.finish).toHaveBeenCalledWith(f.operation.id, "lease-token",
      expect.objectContaining({ status: "UNKNOWN", resolvedAt: null }), undefined);
    expect(f.provider.changeDeparture).toHaveBeenCalledTimes(1);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "missing", "generic"])("never treats GH rejection %s as permission for another declaration", async (reason) => {
    const f = extendingFixture();
    f.operation.wasOverdue = true;
    const message = reason === "missing"
      ? "Số Giấy tờ 001122334455 đang không tồn tại trong hệ thống"
      : reason === "duplicate" ? "Giấy tờ 001122334455 đã có khai báo tạm trú" : "Không tìm thấy hồ sơ";
    f.provider.changeDeparture.mockResolvedValue({ outcome: "BUSINESS_REJECTION", code: "400", message });
    await f.service.run(f.resolveSession);
    expect(f.repository.finish).toHaveBeenCalledWith(f.operation.id, "lease-token",
      expect.objectContaining({ status: "REJECTED" }), undefined);
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("rejects incomplete recovery data before sending a new check-in", async () => {
    const f = extendingFixture();
    f.operation.kind = "RECOVER";
    f.operation.wasOverdue = true;
    f.repository.acknowledgedOperations.mockResolvedValue([]);
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "LOCAL_VALIDATION" }));
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("does not recover a stay without overdue evidence", async () => {
    const f = extendingFixture();
    f.operation.kind = "RECOVER";
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "OVERDUE_RECOVERY_NOT_APPLICABLE" }));
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("recovers one overdue stay through a full check-in with the original identity", async () => {
    const f = extendingFixture();
    f.operation.kind = "RECOVER";
    f.operation.wasOverdue = true;
    f.repository.acknowledgedOperations.mockResolvedValue([]);
    Object.assign(f.declaration.submittedPayloadJson![0], {
      gioiTinh: "M", ngayThangNamSinhStr: "1990-01-01", lyDoCuTru: 1,
    });
    await f.service.run(f.resolveSession);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith("VIETNAMESE", [expect.objectContaining({
      soGiayTo: originalGuest.soGiayTo, loaiGiayTo: 1, soPhong: "101",
      ngayDenCsltStr: originalGuest.ngayDenCsltStr, ngayDiDuKienStr: "2026-11-10 14:00:00",
    })], "test-access-token");
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.repository.finish).toHaveBeenCalledWith(f.operation.id, "lease-token",
      expect.objectContaining({ status: "SUCCEEDED", providerCode: "200" }), undefined);
  });

  it("does not recover before the acknowledged departure has elapsed", async () => {
    const f = extendingFixture();
    f.operation.kind = "RECOVER";
    f.operation.wasOverdue = true;
    f.repository.acknowledgedOperations.mockResolvedValue([{
      kind: "EXTEND", desiredDepartureAt: new Date("2026-11-06T07:00:00Z"),
    }]);
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "OVERDUE_RECOVERY_NOT_APPLICABLE" }));
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("does not change an old stay once a newer stay has been declared for the identity", async () => {
    const f = extendingFixture();
    f.repository.declarationsForIdentity.mockResolvedValue([{
      ...f.declaration, stayId: "newer-stay", submittedAt: new Date("2026-11-05T00:00:00Z"),
      stay: { checkedInAt: new Date("2026-11-05T00:00:00Z") },
    }]);
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "NEWER_STAY_DECLARED" }));
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  function foreignFixture() {
    const f = extendingFixture();
    const guest = {
      hoTen: "Ivan Petrov", quocTich: "RUS", soHoChieu: "A1234567", gioiTinh: "M",
      loaiNgayThangNamSinh: "D", ngayThangNamSinhStr: "1990-01-01", soPhong: "101",
      ngayDenCsltStr: originalGuest.ngayDenCsltStr,
      ngayDiDuKienStr: originalGuest.ngayDiDuKienStr,
      thoiHanTamTruStr: "2026-12-01 14:00:00",
    };
    f.declaration.declarationKind = "FOREIGN";
    f.declaration.submittedPayloadJson = [guest];
    f.operation.declarationKind = "FOREIGN";
    f.operation.identityKey = providerIdentity("FOREIGN", guest)!.key;
    f.repository.declarationsForIdentity.mockResolvedValue([{
      ...f.declaration, stay: { checkedInAt: f.stay.checkedInAt },
    }]);
    return { ...f, guest };
  }

  it.each([null, "2026-11-09 14:00:00"])("blocks foreign GH with inadequate residence validity %s", async (validUntil) => {
    const f = foreignFixture();
    f.declaration.submittedPayloadJson![0].thoiHanTamTruStr = validUntil;
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({ providerCode: "RESIDENCE_VALIDITY_REQUIRED" }));
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  it("accepts foreign GH exactly at residence validity without replacing that validity", async () => {
    const f = foreignFixture();
    f.declaration.submittedPayloadJson![0].thoiHanTamTruStr = "2026-11-10 14:00:00";
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).toHaveBeenCalledWith("FOREIGN", [{
      loai: "GH", soHc: "A1234567", quocTich: "RUS", thoiGianStr: "2026-11-10 14:00:00",
      thoiHanTamTruVnStr: "2026-11-10 14:00:00",
    }], "test-access-token");
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  it("recovers one overdue foreign guest with the acknowledged passport and residence validity", async () => {
    const f = foreignFixture();
    f.operation.kind = "RECOVER";
    f.operation.wasOverdue = true;
    f.repository.acknowledgedOperations.mockResolvedValue([]);
    await f.service.run(f.resolveSession);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.submitDeclaration).toHaveBeenCalledWith("FOREIGN", [expect.objectContaining({
      soHoChieu: "A1234567", quocTich: "RUS", thoiHanTamTruStr: "2026-12-01 14:00:00",
      ngayDiDuKienStr: "2026-11-10 14:00:00", soPhong: "101",
    })], "test-access-token");
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  it.each(["VIETNAMESE", "FOREIGN"] as const)("directly declares an overdue %s extension without a GH probe", async (kind) => {
    const f = kind === "FOREIGN" ? foreignFixture() : extendingFixture();
    Object.assign(f.declaration.submittedPayloadJson![0], {
      gioiTinh: "M", ngayThangNamSinhStr: "1990-01-01", lyDoCuTru: 1,
    });
    f.repository.acknowledgedOperations.mockResolvedValue([]);
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"], {kind:"RECOVER", wasOverdue:true});
    expect(f.repository.claim).toHaveBeenCalledWith(expect.objectContaining({kind:"RECOVER",wasOverdue:true}),
      "lease-token", expect.any(Array), expect.any(String));
  });

  it("supersedes an overdue extension already acknowledged by a prior recovery", async () => {
    const f = extendingFixture();
    f.repository.acknowledgedOperations.mockResolvedValue([{kind:"RECOVER",desiredDepartureAt:f.stay.plannedCheckOutAt}]);
    await f.service.run(f.resolveSession);
    expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
      expect.objectContaining({status:"SUPERSEDED",providerCode:"ALREADY_SYNCHRONIZED"}));
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  it("allows a later overdue cycle after a successful prior recovery", async () => {
    const f = foreignFixture();
    f.repository.acknowledgedOperations.mockResolvedValue([{kind:"RECOVER",desiredDepartureAt:new Date("2026-11-04T00:59:00Z")}]);
    await f.service.run(f.resolveSession);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  it.each(["rejected", "ambiguous", "throw"])("preserves recovery outcome %s without fallback calls", async (result) => {
    const f = foreignFixture();
    f.repository.acknowledgedOperations.mockResolvedValue([]);
    if(result === "throw") f.provider.submitDeclaration.mockRejectedValue(new Error("Network interrupted"));
    else f.provider.submitDeclaration.mockResolvedValue({outcome:result === "rejected" ? "BUSINESS_REJECTION" : "AMBIGUOUS",code:"400",message:"Duplicate or unknown"});
    await f.service.run(f.resolveSession);
    expect(f.repository.finish).toHaveBeenCalledWith(f.operation.id,"lease-token",
      expect.objectContaining({status:result === "rejected" ? "REJECTED" : "UNKNOWN"}),undefined);
    expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
    expect(f.provider.changeDeparture).not.toHaveBeenCalled();
  });

  it("does not send recovery if its action transition loses the compare-and-swap", async () => {
    const f = foreignFixture();
    f.repository.acknowledgedOperations.mockResolvedValue([]);
    f.repository.update.mockResolvedValue(false);
    await f.service.run(f.resolveSession);
    expect(f.repository.claim).not.toHaveBeenCalled();
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

  describe.each(["VIETNAMESE", "FOREIGN"] as const)("%s calendar-day policy", (kind) => {
    const create = () => kind === "FOREIGN" ? foreignFixture() : extendingFixture();

    it.each(["2026-11-05T00:59:00Z", "2026-11-05T16:59:59Z"])(
      "suppresses an hour-only edit to %s even with local overdue evidence", async (departure) => {
        const f = create();
        f.stay.plannedCheckOutAt = new Date(departure);
        f.operation.desiredDepartureAt = f.stay.plannedCheckOutAt;
        f.operation.wasOverdue = true;
        f.repository.acknowledgedOperations.mockResolvedValue([{
          kind: "RECOVER", desiredDepartureAt: new Date("2026-11-05T01:00:00Z"),
        }]);
        await f.service.run(f.resolveSession);
        expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
          expect.objectContaining({ status: "SUPERSEDED", providerCode: "ALREADY_SYNCHRONIZED" }));
        expect(f.repository.claim).not.toHaveBeenCalled();
        expect(f.resolveSession).not.toHaveBeenCalled();
        expect(f.provider.changeDeparture).not.toHaveBeenCalled();
        expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
      },
    );

    it("uses GH after today's checkout hour passes without creating another check-in", async () => {
      const f = create();
      f.repository.acknowledgedOperations.mockResolvedValue([{
        kind: "EXTEND", desiredDepartureAt: new Date("2026-11-05T00:59:00Z"),
      }]);
      await f.service.run(f.resolveSession);
      expect(f.provider.changeDeparture).toHaveBeenCalledTimes(1);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    });

    it("blocks a persisted RECOVER when only today's checkout hour has elapsed", async () => {
      const f = create();
      f.operation.kind = "RECOVER";
      f.operation.wasOverdue = true;
      f.repository.acknowledgedOperations.mockResolvedValue([{
        kind: "EXTEND", desiredDepartureAt: new Date("2026-11-05T00:59:00Z"),
      }]);
      await f.service.run(f.resolveSession);
      expect(f.repository.update).toHaveBeenCalledWith(f.operation.id, ["PENDING", "BLOCKED"],
        expect.objectContaining({ providerCode: "OVERDUE_RECOVERY_NOT_APPLICABLE" }));
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
      expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    });

    it("recovers only after Vietnam midnight even when both instants have the same UTC date", async () => {
      const f = create();
      jest.setSystemTime(new Date("2026-11-04T17:00:00Z"));
      f.repository.acknowledgedOperations.mockResolvedValue([{
        kind: "EXTEND", desiredDepartureAt: new Date("2026-11-04T16:59:59Z"),
      }]);
      Object.assign(f.declaration.submittedPayloadJson![0], {
        gioiTinh: "M", ngayThangNamSinhStr: "1990-01-01", lyDoCuTru: 1,
      });
      await f.service.run(f.resolveSession);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(1);
      expect(f.provider.changeDeparture).not.toHaveBeenCalled();
    });

    it("retains a queued date update after a later hour-only PMS edit", async () => {
      const f = create();
      f.stay.plannedCheckOutAt = new Date("2026-11-10T16:00:00Z");
      await f.service.run(f.resolveSession);
      expect(f.repository.claim).toHaveBeenCalledTimes(1);
      expect(f.provider.changeDeparture).toHaveBeenCalledTimes(1);
      expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
    });

    it.each([
      ["2026-11-04T08:00:00Z", "SUCCESS"],
      ["2026-11-04T17:00:00Z", "BUSINESS_REJECTION"],
    ])("checks the initial queued date against %s", async (departure, outcome) => {
      const f = create();
      f.declaration.status = "SENDING";
      f.stay.plannedCheckOutAt = new Date(departure);
      f.repository.initialDeclaration.mockResolvedValue({ ...f.declaration, stay: f.stay });
      const result = await f.service.sendInitial(f.stay.hotelId, kind,
        f.declaration.submittedPayloadJson!, "test-access-token", f.declaration.id, "cslt-1");
      expect(result.outcome).toBe(outcome);
      expect(f.provider.submitDeclaration).toHaveBeenCalledTimes(outcome === "SUCCESS" ? 1 : 0);
      if (outcome !== "SUCCESS") expect(result.code).toBe("LOCAL_STATE_CHANGED");
    });
  });

  it("uses foreign residence validity by date while retaining its explicit wire value", async () => {
    const f = foreignFixture();
    f.declaration.submittedPayloadJson![0].thoiHanTamTruStr = "2026-11-10 00:00:00";
    await f.service.run(f.resolveSession);
    expect(f.provider.changeDeparture).toHaveBeenCalledWith("FOREIGN", [expect.objectContaining({
      thoiGianStr: "2026-11-10 14:00:00", thoiHanTamTruVnStr: "2026-11-10 00:00:00",
    })], "test-access-token");
    expect(f.provider.submitDeclaration).not.toHaveBeenCalled();
  });

});


describe("BCA transactional claim calendar-day guard", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-11-05T01:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it.each([
    ["hour-only change", "2026-11-10T16:00:00Z", "2026-11-10T07:00:00Z", true],
    ["same Vietnam day across UTC dates", "2026-11-09T17:00:00Z", "2026-11-10T01:00:00Z", true],
    ["different Vietnam days within one UTC date", "2026-11-10T17:00:00Z", "2026-11-10T16:59:59Z", false],
    ["today after checkout hour", "2026-11-05T00:59:00Z", "2026-11-05T00:59:00Z", true],
    ["past calendar day", "2026-11-04T16:59:59Z", "2026-11-04T16:59:59Z", false],
  ])("claims correctly for %s", async (_label, current, desired, expected) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      guestStay: { findFirst: jest.fn().mockResolvedValue({
        status: "ACTIVE", checkedOutAt: null, plannedCheckOutAt: new Date(current),
      }) },
      kbttDeliveryLease: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      kbttStayOperation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = { $transaction: jest.fn(async (action: (client: typeof tx) => Promise<boolean>) => action(tx)) };
    const repository = new KbttStayRepository(prisma as unknown as ConstructorParameters<typeof KbttStayRepository>[0]);
    expect(await repository.claim({
      id: "operation-1", hotelId: "hotel-1", stayId: "stay-1", csltId: "cslt-1",
      kind: "EXTEND", desiredDepartureAt: new Date(desired),
    }, "lease-token", [], "fingerprint")).toBe(expected);
    expect(tx.kbttStayOperation.updateMany).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(tx.kbttDeliveryLease.updateMany).toHaveBeenCalledTimes(expected ? 1 : 0);
  });
});
