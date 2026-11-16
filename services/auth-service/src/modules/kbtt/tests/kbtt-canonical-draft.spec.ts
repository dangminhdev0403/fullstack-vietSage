import { ConflictException } from '@nestjs/common';
import { KbttRepository } from '../infrastructure/kbtt.repository';

jest.mock('../../../common/config/env.config', () => ({ envConfig: {} }));

function fixture(isPrimary = true) {
  let state = { profile: { id: 'occ-1', hotelId: 'hotel-1', stayId: 'stay-1', fullName: 'Nguyen Van A', isPrimary, updatedAt: new Date('2026-11-16T00:00:00Z') },
    declaration: { id: 'decl-1', hotelId: 'hotel-1', stayId: 'stay-1', occupantId: 'occ-1', version: 1, status: 'DRAFT', draftPayloadJson: {} }, summary: { guestDisplayName: 'Nguyen Van A' } };
  const tx = {
    $queryRaw: jest.fn(async (..._args: any[]) => [{ id: "stay-1" }]),
    guestStayOccupant: { findFirst: jest.fn(async () => ({ ...state.profile })), updateMany: jest.fn(async ({ data }: any) => { state.profile = { ...state.profile, ...data }; return { count: 1 }; }) },
    kbttGuestDeclaration: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (state.declaration.version !== where.version || !where.status.in.includes(state.declaration.status)) return { count: 0 };
        state.declaration = { ...state.declaration, ...data, version: state.declaration.version + 1 }; return { count: 1 };
      }),
      findFirst: jest.fn(async () => ({ ...state.declaration })), create: jest.fn(),
    },
    guestStay: { updateMany: jest.fn(async ({ data }: any) => { state.summary = { ...state.summary, ...data }; return { count: 1 }; }) },
  };
  const prisma = { $transaction: jest.fn(async (work: any) => { const original = structuredClone(state); try { return await work(tx); } catch (error) { state = original; throw error; } }) };
  const repository = new KbttRepository(prisma as never);
  const params = { hotelId: 'hotel-1', stayId: 'stay-1', occupantId: 'occ-1', expectedOccupantUpdatedAt: state.profile.updatedAt,
    existing: { id: 'decl-1', version: 1 }, declarationKind: 'VIETNAMESE' as const, draftPayloadJson: { loaiGiayTo: 8 },
    profile: { fullName: 'Bui Thanh Hong', phone: null, citizenshipKind: 'VIETNAMESE' as const } };
  return { repository, tx, params, state: () => state };
}

describe('canonical BCA draft transaction', () => {
  it('saves profile, compact draft and primary compatibility summary in one transaction', async () => {
    const f = fixture();
    await f.repository.saveCanonicalDraft(f.params);
    expect(f.state().profile.fullName).toBe('Bui Thanh Hong');
    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(f.tx.guestStayOccupant.findFirst.mock.invocationCallOrder[0]);
    expect(f.tx.$queryRaw.mock.calls[0]?.[0].join('')).toContain('FOR UPDATE');
    expect(f.state().declaration.draftPayloadJson).toEqual({ loaiGiayTo: 8 });
    expect(f.state().summary.guestDisplayName).toBe('Bui Thanh Hong');
    expect(f.tx.guestStayOccupant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'occ-1', hotelId: 'hotel-1', stayId: 'stay-1' }) }));
  });

  it('never changes primary summary when editing a co-guest', async () => {
    const f = fixture(false);
    await f.repository.saveCanonicalDraft(f.params);
    expect(f.tx.guestStay.updateMany).not.toHaveBeenCalled();
    expect(f.state().summary.guestDisplayName).toBe('Nguyen Van A');
  });

  it.each(['SUBMITTED', 'UNKNOWN'])('fences %s before any profile write', async (status) => {
    const f = fixture();
    f.state().declaration.status = status;
    await expect(f.repository.saveCanonicalDraft(f.params)).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.guestStayOccupant.updateMany).not.toHaveBeenCalled();
    expect(f.tx.guestStay.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back the declaration when canonical profile persistence fails', async () => {
    const f = fixture();
    f.tx.guestStayOccupant.updateMany.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(f.repository.saveCanonicalDraft(f.params)).rejects.toThrow();
    expect(f.state().declaration).toMatchObject({ version: 1, draftPayloadJson: {} });
    expect(f.state().profile.fullName).toBe('Nguyen Van A');
  });

  it('rejects a stale canonical read before touching the declaration', async () => {
    const f = fixture();
    f.params.expectedOccupantUpdatedAt = new Date('2026-11-15T00:00:00Z');
    await expect(f.repository.saveCanonicalDraft(f.params)).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.kbttGuestDeclaration.updateMany).not.toHaveBeenCalled();
  });
  it('rejects a missing or wrong-hotel stay before locking its profile or declaration', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(f.repository.saveCanonicalDraft(f.params)).rejects.toThrow('Không tìm thấy lượt lưu trú');
    expect(f.tx.guestStayOccupant.findFirst).not.toHaveBeenCalled();
    expect(f.tx.kbttGuestDeclaration.updateMany).not.toHaveBeenCalled();
  });

});
