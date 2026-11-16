import { composeKbttDraft, compactKbttDeclarationDraft, markKbttDeclarationDates } from '../domain/kbtt-draft-profile';

const occupant = { fullName: 'Test Guest', roomNumber: '101', checkedInAt: new Date('2026-11-17T02:00:00Z'), plannedCheckOutAt: new Date('2026-11-19T05:00:00Z') };

describe('explicit declaration dates', () => {
  it.each(['VIETNAMESE', 'FOREIGN'] as const)('preserves explicitly edited %s dates through compaction without altering PMS dates', (kind) => {
    const edits = { ngayDenCsltStr: '2026-11-16 18:00:00', ngayDiDuKienStr: '2026-11-20 12:00:00' };
    const composed = composeKbttDraft(kind, markKbttDeclarationDates({}, edits), occupant);
    expect(composed).toMatchObject(edits);
    expect(composed).not.toHaveProperty('__kbttDeclarationDates');
    const stored = compactKbttDeclarationDraft(kind, composed, occupant);
    expect(composeKbttDraft(kind, stored, occupant)).toMatchObject(edits);
    expect(occupant.checkedInAt.toISOString()).toBe('2026-11-17T02:00:00.000Z');
    expect(occupant.plannedCheckOutAt.toISOString()).toBe('2026-11-19T05:00:00.000Z');
  });
  it('keeps unmarked legacy dates tied to PMS rather than resurrecting stale duplicates', () => {
    expect(composeKbttDraft('VIETNAMESE', { ngayDenCsltStr: '2020-01-01 00:00:00', ngayDiDuKienStr: '2020-01-02 00:00:00' }, occupant))
      .toMatchObject({ ngayDenCsltStr: '2026-11-17 09:00:00', ngayDiDuKienStr: '2026-11-19 12:00:00' });
  });
  it('always uses tourism for Vietnamese declarations, even with a stored alternate reason', () => {
    expect(composeKbttDraft('VIETNAMESE', { lyDoCuTru: 20 }, occupant).lyDoCuTru).toBe(1);
  });
  it('invalidates edited dates when the underlying stay changes', () => {
    const edits = { ngayDenCsltStr: '2026-11-16 18:00:00', ngayDiDuKienStr: '2026-11-20 12:00:00' };
    const stored = compactKbttDeclarationDraft('VIETNAMESE', composeKbttDraft('VIETNAMESE', markKbttDeclarationDates({}, edits), occupant), occupant);
    const changed = { ...occupant, plannedCheckOutAt: new Date('2026-11-21T05:00:00Z') };
    expect(composeKbttDraft('VIETNAMESE', stored, changed)).toMatchObject({ ngayDenCsltStr: '2026-11-17 09:00:00', ngayDiDuKienStr: '2026-11-21 12:00:00' });
  });
});
