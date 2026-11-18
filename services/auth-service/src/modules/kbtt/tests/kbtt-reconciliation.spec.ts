import {
  reconcileGuests, reconciliationArrivalDay,
  type LocalReconciliationGuest, type ProviderReconciliationGuest, type ReconciliationKind,
} from "../domain/kbtt-reconciliation";

const all = () => new Set<ReconciliationKind>(["VIETNAMESE", "FOREIGN"]);
function local(overrides: Partial<LocalReconciliationGuest> = {}): LocalReconciliationGuest {
  return {
    id: "occupant-a", stayId: "stay-a", roomId: "room-a", roomNumber: "A01", groupCode: "GROUP-A",
    fullName: "Khách mẫu", identityNumber: "001234567890", kind: "VIETNAMESE", documentType: 1,
    nationality: "VNM", checkedInAt: "2026-09-16T18:00:00Z", plannedCheckOutAt: "2026-09-18T05:00:00Z",
    declarationStatus: "READY", providerMessage: null, linkedBcaId: null, ...overrides,
  };
}
function remote(overrides: Partial<ProviderReconciliationGuest> = {}): ProviderReconciliationGuest {
  return {
    id: "bca-a", kind: "VIETNAMESE", csltId: "123", fullName: "TÊN CÓ THỂ KHÁC", identityNumber: "001234567890",
    documentType: 1, nationality: "VNM", arrivalDay: "2026-09-17", checkedInAt: "2026-09-17T00:00:00+07:00",
    plannedCheckOutAt: "2026-09-18T12:00:00+07:00", departed: false, roomNumber: "A99", isActive: false,
    ...overrides,
  };
}

describe("BCA read-only reconciliation", () => {
  it("matches the persisted rounded wire day without changing the actual check-in shown locally", () => {
    const guest = local({ checkedInAt: "2026-09-01T07:00:00Z", submittedArrivalAt: "2026-09-17T07:00:00Z", declarationStatus: "UNKNOWN" });
    const result = reconcileGuests([guest], [remote()], all(), "123");
    expect(result[0]).toMatchObject({ status: "MATCHED", canRetry: false, checkedInAt: guest.checkedInAt });
    expect(reconcileGuests([guest], [remote({ csltId: "other" })], all(), "123")[0].status).not.toBe("MATCHED");
  });
  it("matches exact qualified identity and Vietnam arrival day regardless of name, room, or local send state", () => {
    const rows = reconcileGuests([local()], [remote()], all(), "123");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "VIETSAGE", status: "MATCHED", bcaRecordId: "bca-a", canRetry: false });
    expect(rows[0].fullName).toBe("Khách mẫu");
    expect(rows[0].roomNumber).toBe("A01");
  });

  it("matches a foreign passport with case/outer-space normalization while retaining the original strings", () => {
    const guest = local({ kind: "FOREIGN", nationality: " gbr ", identityNumber: " ab000123 ", documentType: 4 });
    const rows = reconcileGuests([guest], [remote({ kind: "FOREIGN", identityNumber: "AB000123", nationality: "GBR" })], all(), "123");
    expect(rows[0]).toMatchObject({ status: "MATCHED", identityNumber: " ab000123 ", nationality: " gbr " });
  });

  it("preserves leading zeroes and never matches names or room numbers alone", () => {
    const rows = reconcileGuests([local()], [remote({ identityNumber: "1234567890", fullName: "Khách mẫu", roomNumber: "A01" })], all(), "123");
    expect(rows[0].status).toBe("NOT_FOUND");
  });

  it.each([
    [{ documentType: 2 }, {}],
    [{ kind: "FOREIGN", nationality: "GBR", identityNumber: "AB000123" }, { kind: "FOREIGN", nationality: "USA", identityNumber: "AB000123" }],
  ] as Array<[Partial<LocalReconciliationGuest>, Partial<ProviderReconciliationGuest>]>)("requires review for a document qualifier mismatch", (a, b) => {
    expect(reconcileGuests([local(a)], [remote(b)], all(), "123")[0].status).toBe("REVIEW");
  });

  it("does not mistake a previous stay for the current arrival", () => {
    const rows = reconcileGuests([local()], [remote({ arrivalDay: "2026-09-12", checkedInAt: "2026-09-12T00:00:00+07:00", departed: true })], all(), "123");
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("NOT_FOUND");
  });

  it("excludes foreign accommodation records from matching and BCA-only rows", () => {
    const rows = reconcileGuests([local()], [remote({ csltId: "999", isActive: true })], all(), "123");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("NOT_FOUND");
  });

  it.each([
    { kind: null }, { identityNumber: null }, { documentType: null }, { checkedInAt: null },
    { checkedInAt: "2026-09-17" }, { checkedInAt: "2026-02-31T00:00:00Z" },
  ] as Array<Partial<LocalReconciliationGuest>>)("requests review for an incomplete or invalid local matching key", (overrides) => {
    const result = reconcileGuests([local(overrides)], [], all(), "123")[0];
    expect(result).toMatchObject({ status: "REVIEW", canRetry: false });
    expect(result.reason).toEqual(expect.any(String));
  });

  it("preserves independent source completeness for both citizenship groups", () => {
    const vn = local({ declarationStatus: "FAILED" });
    const foreign = local({ id: "occupant-b", stayId: "stay-b", kind: "FOREIGN", identityNumber: "AB000123", nationality: "GBR" });
    const rows = reconcileGuests([vn, foreign], [], new Set(["VIETNAMESE"]), "123");
    expect(rows.map((r) => [r.status, r.canRetry])).toEqual([["NOT_FOUND", true], [null, false]]);
    expect(reconcileGuests([vn], [remote()], new Set(), "123")[0].status).toBeNull();
  });

  it.each(["SUBMITTED", "UNKNOWN", "CANCELLED"])("never enables retry merely because %s is absent remotely", (declarationStatus) => {
    expect(reconcileGuests([local({ declarationStatus })], [], all(), "123")[0].canRetry).toBe(false);
  });

  it.each(["READY", "DRAFT", "FAILED", null])("allows validating an absent local %s declaration for sending", (declarationStatus) => {
    const result = reconcileGuests([local({ declarationStatus })], [], all(), "123");
    expect(result[0]).toMatchObject({ status: "NOT_FOUND", canRetry: true });
  });

  it("never retries a failed declaration whose remote existence was confirmed", () => {
    expect(reconcileGuests([local({ declarationStatus: "FAILED" })], [remote()], all(), "123")[0]).toMatchObject({ status: "MATCHED", canRetry: false });
  });

  it("requires review instead of attaching one BCA record to multiple local guests or stays", () => {
    const rows = reconcileGuests([local(), local({ id: "occupant-b", stayId: "stay-b" })], [remote({ isActive: true })], all(), "123");
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.source === "VIETSAGE").map((r) => r.status)).toEqual(["REVIEW", "REVIEW"]);
    expect(rows[2]).toMatchObject({ source: "BCA_ONLY", canRetry: false });
  });

  it("requires review when several distinct BCA IDs match one local stay", () => {
    const rows = reconcileGuests([local()], [remote({ isActive: true }), remote({ id: "bca-b", isActive: true })], all(), "123");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ status: "REVIEW", canRetry: false });
  });

  it("deduplicates an identical repeated BCA ID without changing the local result", () => {
    const rows = reconcileGuests([local()], [remote(), remote()], all(), "123");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("MATCHED");
  });

  it("deduplicates equivalent timestamp representations using the same Vietnam calendar key", () => {
    const rows = reconcileGuests([local()], [remote(), remote({ checkedInAt: "2026-09-16T17:00:00Z" })], all(), "123");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("MATCHED");
  });

  it("does not conclude absence without a configured accommodation scope", () => {
    expect(reconcileGuests([local({ declarationStatus: "FAILED" })], [], all(), "")[0]).toMatchObject({ status: null, canRetry: false });
  });

  it("requires review for every identity affected by contradictory repetitions of one BCA ID", () => {
    const rows = reconcileGuests([local(), local({ id: "occupant-b", identityNumber: "009876543210" })], [
      remote({ isActive: true }), remote({ identityNumber: "009876543210", isActive: true }),
    ], all(), "123");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.status)).toEqual(["REVIEW", "REVIEW"]);
  });

  it.each([
    { documentType: null }, { arrivalDay: null }, { checkedInAt: "2026-09-18T00:00:00+07:00" }, { id: "" },
  ] as Array<Partial<ProviderReconciliationGuest>>)("does not turn incomplete provider identity/date evidence into NOT_FOUND", (overrides) => {
    expect(reconcileGuests([local()], [remote(overrides)], all(), "123")[0].status).toBe("REVIEW");
  });

  it.each([{ csltId: "999" }, { identityNumber: "009876543210" }, { arrivalDay: "2026-09-18", checkedInAt: "2026-09-18T00:00:00+07:00" }])("validates a linked BCA ID against scope, identity and stay day", (overrides) => {
    expect(reconcileGuests([local({ linkedBcaId: "bca-a" })], [remote(overrides)], all(), "123")[0]).toMatchObject({ status: "REVIEW", bcaRecordId: null });
  });

  it("uses a matching linked ID and keeps a historical departed match as existence evidence only", () => {
    const rows = reconcileGuests([local({ linkedBcaId: "bca-a" })], [remote({ departed: true })], all(), "123");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "MATCHED", bcaRecordId: "bca-a" });
  });

  it("renders active and historical provider-only rows without importing guests", () => {
    const rows = reconcileGuests([], [remote({ isActive: true }), remote({ id: "bca-history", identityNumber: "009876543210", isActive: false }),
      remote({ id: "bca-departed", identityNumber: "008765432109", isActive: true, departed: true, checkedOutAt: "2026-09-18T12:00:00+07:00" })], all(), "123");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ source: "BCA_ONLY", occupantId: null, stayId: null, roomId: null, status: "MATCHED", canRetry: false });
    expect(rows[2].checkedOutAt).toBe("2026-09-18T12:00:00+07:00");
  });

  it("keeps unlinked BCA evidence visible when local identity cannot be verified", () => {
    const rows = reconcileGuests([local({ documentType: null })], [remote({ isActive: true })], all(), "123");
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("REVIEW");
  });

  it("does not mutate either source collection", () => {
    const locals = [local()]; const remotes = [remote()];
    const before = JSON.stringify({ locals, remotes });
    reconcileGuests(locals, remotes, all(), "123");
    expect(JSON.stringify({ locals, remotes })).toBe(before);
  });
});

describe("Vietnam check-in day", () => {
  it("handles UTC midnight rollover and rejects timezone-free values", () => {
    expect(reconciliationArrivalDay("2026-09-16T17:00:00Z")).toBe("2026-09-17");
    expect(reconciliationArrivalDay("2026-09-16T16:59:59Z")).toBe("2026-09-16");
    expect(reconciliationArrivalDay("2026-09-17T00:00:00")).toBeNull();
    expect(reconciliationArrivalDay("invalid")).toBeNull();
  });
});
