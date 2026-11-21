import { describe, expect, it } from 'vitest';
import { contractsEnding } from './alerts.js';

describe('contractsEnding', () => {
  const today = '2026-11-21';
  it('lists contracts ending within 60 days, soonest first, with the days left', () => {
    const r = contractsEnding(
      [
        { unitId: 'b', endDate: '2027-01-15' },
        { unitId: 'a', endDate: '2026-12-01' },
        { unitId: 'far', endDate: '2027-08-31' },
        { unitId: 'open', endDate: null },
      ],
      today,
    );
    expect(r).toEqual([
      { unitId: 'a', endDate: '2026-12-01', days: 10 },
      { unitId: 'b', endDate: '2027-01-15', days: 55 },
    ]);
  });
  it('a contract ending today still counts, one that ended does not', () => {
    expect(contractsEnding([{ unitId: 'x', endDate: today }, { unitId: 'y', endDate: '2026-11-20' }], today).map((c) => c.unitId)).toEqual(['x']);
  });
  it('the window can be changed', () => {
    expect(contractsEnding([{ unitId: 'b', endDate: '2027-01-15' }], today, 30)).toEqual([]);
  });
});
