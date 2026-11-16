import { ForbiddenException } from "@nestjs/common";
import { KbttReconciliationService } from "../application/kbtt-reconciliation.service";
import { KbttProviderReadError } from "../infrastructure/kbtt-provider-read.client";
import { kbttReconciliationResponseSchema } from "../domain/schemas/kbtt-reconciliation.schema";
import { KbttController } from "../api/kbtt.controller";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";

jest.mock("../../../common/config/env.config", () => ({ envConfig: {} }));

function fixture() {
  const connection = { hotelId: "hotel-1", status: "CONNECTED", csltId: "123", ciphertext: "encrypted" };
  const session = { AccessToken: "fixture-access-secret", RefreshToken: "fixture-refresh-secret", CsltId: "123", Exp: 9999999999, Authorities: [] };
  const local = { id: "occupant-1", occupantId: "occupant-1", hotelId: "hotel-1", stayId: "stay-1", roomId: "room-1", roomNumber: "101", groupCode: "GROUP-1", fullName: "Khách mẫu", identityNumber: "000000000001", nationality: "VNM", citizenshipKind: "VIETNAMESE", checkedInAt: new Date("2026-11-15T17:30:00Z"), plannedCheckInAt: new Date("2026-11-15T17:30:00Z"), plannedCheckOutAt: new Date("2026-11-18T05:00:00Z") };
  const record = { id: "bca-1", hoTen: "Khách mẫu", csltId: 123, soGiayTo: "000000000001", loaiGiayTo: 1, quocTich: "VNM", ngayDenCslt: "2026-11-16T00:30:00+07:00", ngayDiCslt: "", ngayDiDuKien: "2026-11-18T12:00:00+07:00", soPhong: "101" };
  const access = { assertHotelAccess: jest.fn().mockResolvedValue({}), resolveRoomScope: jest.fn().mockResolvedValue({ mode: "HOTEL_WIDE", allowedRoomId: null }) };
  const repository = { find: jest.fn().mockResolvedValue(connection), findDeclarationsByHotel: jest.fn().mockResolvedValue([]), save: jest.fn(), update: jest.fn(), createDeclaration: jest.fn() };
  const occupants = { getActiveStayOccupants: jest.fn().mockResolvedValue([local]) };
  const sessions = { getCachedReadSession: jest.fn().mockReturnValue(session), expireRejectedReadSession: jest.fn(), connect: jest.fn(), check: jest.fn() };
  const provider = { readAllResidents: jest.fn(async (_kind: string, _token: string): Promise<unknown[]> => []), readAllHistory: jest.fn(async (kind: string, _token: string, _range: unknown): Promise<unknown[]> => kind === "VIETNAMESE" ? [record] : []) };
  const service = new KbttReconciliationService(access as never, repository as never, occupants as never, sessions as never, provider as never);
  return { access, repository, occupants, sessions, provider, service, connection, session, local, record };
}
const savedEnv = { ...process.env };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-11-16T06:00:00Z")); process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED = "false"; process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH = "true"; });
afterEach(() => { jest.useRealTimers(); process.env = { ...savedEnv }; });

describe("both-country read-only in-house reconciliation", () => {
  it("retains gender and date of birth from BCA-only history rows for readonly table cells", async () => {
    const f = fixture(); f.occupants.getActiveStayOccupants.mockResolvedValue([]);
    f.provider.readAllHistory.mockImplementation(async (kind) => kind === "VIETNAMESE" ? [{ ...f.record, gioiTinh: "M", ngayThangNamSinh: "1990-01-02T00:00:00Z" }] : []);
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.items[0]).toMatchObject({ source: "BCA_ONLY", canRetry: false,
      draftPayload: { gioiTinh: "M", ngayThangNamSinhStr: "1990-01-02", soGiayTo: f.record.soGiayTo } });
    expect(result.items[0].occupantId).toBeNull();
  });
  it("projects only schema-approved editable draft fields without credentials or provider response metadata", async () => {
    const f = fixture();
    f.repository.findDeclarationsByHotel.mockResolvedValue([{
      occupantId: "occupant-1", status: "DRAFT", declarationKind: "VIETNAMESE",
      draftPayloadJson: { loaiGiayTo: 1, lyDoCuTru: 1, accessToken: "must-not-leak", internalMetadata: { private: true }, ghiChu: { token: "invalid-value" } },
    }]);
    const result = await f.service.get("owner", "role", "hotel-1", false, true);
    expect(result.items[0].draftPayload).toMatchObject({ hoTen: f.local.fullName, soGiayTo: f.local.identityNumber, loaiGiayTo: 1, lyDoCuTru: 1 });
    expect(result.items[0].draftPayload).not.toHaveProperty("accessToken");
    expect(result.items[0].draftPayload).not.toHaveProperty("internalMetadata");
    expect(result.items[0].draftPayload).not.toHaveProperty("ghiChu");
    expect(f.provider.readAllHistory).not.toHaveBeenCalled();
  });
  it("always reads both groups and both active/history sources, even with only VN local guests", async () => {
    const f = fixture(); const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(f.provider.readAllResidents.mock.calls.map((c) => c[0])).toEqual(["VIETNAMESE", "FOREIGN"]);
    expect(f.provider.readAllHistory.mock.calls.map((c) => c[0])).toEqual(["VIETNAMESE", "FOREIGN"]);
    for (const kind of ["VIETNAMESE", "FOREIGN"]) expect(f.provider.readAllHistory).toHaveBeenCalledWith(kind, f.session.AccessToken, {}, expect.any(AbortSignal));
    expect(result.sources.VIETNAMESE.state).toBe("COMPLETE"); expect(result.sources.FOREIGN.state).toBe("COMPLETE");
    expect(result.items[0]).toMatchObject({ status: "MATCHED", groupCode: "GROUP-1", bcaRecordId: "bca-1" });
    expect(kbttReconciliationResponseSchema.safeParse(result).success).toBe(true);
    expect(f.repository.save).not.toHaveBeenCalled(); expect(f.repository.update).not.toHaveBeenCalled(); expect(f.repository.createDeclaration).not.toHaveBeenCalled();
    expect(f.sessions.connect).not.toHaveBeenCalled(); expect(f.sessions.check).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(f.session.AccessToken);
  });
  it("keeps all local guests when no BCA session exists and never authenticates from a GET", async () => {
    const f = fixture(); f.sessions.getCachedReadSession.mockReturnValue(null);
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.items).toHaveLength(1); expect(result.items[0].status).toBeNull();
    expect(result.sources.VIETNAMESE.state).toBe("NEEDS_LOGIN"); expect(result.sources.FOREIGN.state).toBe("NEEDS_LOGIN");
    expect(f.provider.readAllHistory).not.toHaveBeenCalled(); expect(f.provider.readAllResidents).not.toHaveBeenCalled(); expect(f.sessions.check).not.toHaveBeenCalled();
  });
  it("rejects hotel access before reading either database guests or provider", async () => {
    const f = fixture(); f.access.assertHotelAccess.mockRejectedValue(new ForbiddenException("denied"));
    await expect(f.service.get("other", "role", "hotel-1", true)).rejects.toThrow(ForbiddenException);
    expect(f.occupants.getActiveStayOccupants).not.toHaveBeenCalled(); expect(f.provider.readAllHistory).not.toHaveBeenCalled();
  });
  it("coalesces concurrent forced reads for BOTH groups and refreshes sequential forced entries", async () => {
    const f = fixture();
    await Promise.all([f.service.get("owner", "role", "hotel-1", true), f.service.get("owner", "role", "hotel-1", true)]);
    expect(f.provider.readAllResidents).toHaveBeenCalledTimes(2); expect(f.provider.readAllHistory).toHaveBeenCalledTimes(2);
    await f.service.get("owner", "role", "hotel-1", false); expect(f.provider.readAllHistory).toHaveBeenCalledTimes(2);
    await f.service.get("owner", "role", "hotel-1", true); expect(f.provider.readAllHistory).toHaveBeenCalledTimes(4);
  });
  it("does not reuse snapshots across BCA session or connection changes", async () => {
    const f = fixture(); await f.service.get("owner", "role", "hotel-1");
    f.sessions.getCachedReadSession.mockReturnValue({ ...f.session, AccessToken: "new-session" });
    await f.service.get("owner", "role", "hotel-1"); expect(f.provider.readAllHistory).toHaveBeenCalledTimes(4);
    f.repository.find.mockResolvedValueOnce(f.connection).mockResolvedValueOnce({ ...f.connection, ciphertext: "changed" });
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.checkedAt).toBeNull(); expect(result.sources.VIETNAMESE.state).toBe("NEEDS_LOGIN"); expect(result.items[0].status).toBeNull();
  });
  it("keeps one provider failure explicit without marking that group's guests not found", async () => {
    const f = fixture(); f.occupants.getActiveStayOccupants.mockResolvedValue([{ ...f.local, citizenshipKind: "FOREIGN", nationality: "GBR", identityNumber: "TESTP001" }]);
    f.provider.readAllHistory.mockImplementation(async (kind) => { if (kind === "FOREIGN") throw new KbttProviderReadError("HTTP", "expired", { httpStatus: 401, providerCode: "401", providerMessage: "expired" }); return []; });
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.sources.VIETNAMESE.state).toBe("COMPLETE"); expect(result.sources.FOREIGN.state).toBe("NEEDS_LOGIN");
    expect(result.checkedAt).toBeNull(); expect(result.items[0].status).toBeNull();
    expect(f.sessions.expireRejectedReadSession).toHaveBeenCalledWith("hotel-1", f.session);
  });
  it.each([
    { id: "malformed", hoTen: "Mẫu", csltId: 123 },
    { id: "wrong-scope", hoTen: "Mẫu", csltId: 999, soGiayTo: "000000000001", loaiGiayTo: 1, ngayDenCslt: "2026-11-16T00:00:00+07:00" },
  ])("treats incomplete or wrong-scope records as incomplete, never a negative conclusion", async (record) => {
    const f = fixture(); f.provider.readAllResidents.mockResolvedValueOnce([record]);
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.sources.VIETNAMESE.state).toBe("INCOMPLETE"); expect(result.items[0].status).toBeNull();
  });
  it("shows active and historical BCA guests as read-only rows without imports", async () => {
    const f = fixture(); f.occupants.getActiveStayOccupants.mockResolvedValue([]);
    f.provider.readAllResidents.mockImplementation(async (kind) => kind === "VIETNAMESE" ? [f.record] : []);
    f.provider.readAllHistory.mockImplementation(async (kind) => kind === "VIETNAMESE" ? [{ ...f.record, id: "departed", ngayDiCslt: "2026-11-16T02:00:00+07:00" }] : []);
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.items).toHaveLength(2); expect(result.items[0]).toMatchObject({ source: "BCA_ONLY", occupantId: null, stayId: null, canRetry: false });
    expect(f.repository.createDeclaration).not.toHaveBeenCalled();
  });
  it("pushes restricted room scope into DB and never exposes unmatched BCA-only guests", async () => {
    const f = fixture(); f.access.resolveRoomScope.mockResolvedValue({ mode: "ROOM_EXCLUSIVE", allowedRoomId: "room-1" });
    f.provider.readAllResidents.mockImplementation(async (kind) => kind === "VIETNAMESE" ? [{ ...f.record, id: "other", soGiayTo: "000000000002", soPhong: "other-room" }] : []);
    const result = await f.service.get("staff", "role", "hotel-1", true);
    expect(f.occupants.getActiveStayOccupants).toHaveBeenCalledWith("hotel-1", { roomIds: ["room-1"] });
    expect(result.items.every((row) => row.source === "VIETSAGE")).toBe(true);
  });
  it("keeps paused delivery disabled even for a definite failed unmatched declaration", async () => {
    const f = fixture(); f.repository.findDeclarationsByHotel.mockResolvedValue([{ occupantId: "occupant-1", status: "FAILED", declarationKind: "VIETNAMESE", draftPayloadJson: {}, providerMessage: "Synthetic rejection" }]);
    f.provider.readAllHistory.mockResolvedValue([]);
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.items[0]).toMatchObject({ status: "NOT_FOUND", declarationStatus: "FAILED", canRetry: false });
  });
  it("protects reconciliation with declarations permissions", () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, KbttController.prototype.getReconciliation)).toEqual(["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"]);
  });
  it("returns a complete local preview immediately without reading either BCA source", async () => {
    const f = fixture();
    const result = await f.service.get("owner", "role", "hotel-1", false, true);
    expect(result.items).toHaveLength(1); expect(result.items[0].status).toBeNull();
    expect(result.sources.VIETNAMESE.state).toBe("PENDING"); expect(result.sources.FOREIGN.state).toBe("PENDING");
    expect(f.sessions.getCachedReadSession).not.toHaveBeenCalled(); expect(f.provider.readAllResidents).not.toHaveBeenCalled(); expect(f.provider.readAllHistory).not.toHaveBeenCalled();
  });

  it("retains last confirmed rows on failed reads and session expiry, with all sends blocked", async () => {
    const f = fixture();
    f.provider.readAllResidents.mockImplementation(async (kind) => kind === "FOREIGN" ? [{ ...f.record, id: "foreign-old", soHoChieu: "TEST001", quocTich: "GBR" }] : []);
    const first = await f.service.get("owner", "role", "hotel-1", true);
    expect(first.items).toHaveLength(2);
    f.provider.readAllHistory.mockRejectedValue(new KbttProviderReadError("NETWORK", "offline"));
    f.provider.readAllResidents.mockRejectedValue(new KbttProviderReadError("NETWORK", "offline"));
    const failed = await f.service.get("owner", "role", "hotel-1", true);
    expect(failed.sources.VIETNAMESE.state).toBe("FAILED");
    expect(failed.items).toEqual(first.items.map((row) => ({ ...row, canRetry: false })));
    expect(failed.checkedAt).toBe(first.checkedAt);
    f.sessions.getCachedReadSession.mockReturnValue(null);
    const preview = await f.service.get("owner", "role", "hotel-1", false, true);
    expect(preview.items).toEqual(failed.items);
    expect(preview.sources.VIETNAMESE.state).toBe("PENDING");
    const expired = await f.service.get("owner", "role", "hotel-1", true);
    expect(expired.sources.FOREIGN.state).toBe("NEEDS_LOGIN");
    expect(expired.items).toEqual(failed.items);
    f.repository.find.mockResolvedValue({ ...f.connection, ciphertext: "different-account" });
    const changed = await f.service.get("owner", "role", "hotel-1", true);
    expect(changed.items).toHaveLength(1); expect(changed.items[0].status).toBeNull();
  });
  it("retains evidence only for the same document and arrival, and updates complete groups independently", async () => {
    const f = fixture(); await f.service.get("owner", "role", "hotel-1", true);
    f.occupants.getActiveStayOccupants.mockResolvedValue([{ ...f.local, identityNumber: "000000000002" }]);
    f.provider.readAllHistory.mockRejectedValue(new KbttProviderReadError("NETWORK", "offline"));
    const result = await f.service.get("owner", "role", "hotel-1", true);
    expect(result.items[0].status).toBeNull(); expect(result.items[0].canRetry).toBe(false);
  });

});
