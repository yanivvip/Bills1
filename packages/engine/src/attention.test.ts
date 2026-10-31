import { describe, expect, it } from 'vitest';
import { attentionItems } from './index.js';

const units = [
  { id: 'u1', name: 'Apt 1', rented: true },
  { id: 'u2', name: 'Apt 2', rented: false },
];
const meters = [
  { id: 'e1', unitId: 'u1', kind: 'electricity' as const, name: 'Apt 1 electricity' },
  { id: 'e2', unitId: 'u2', kind: 'electricity' as const, name: 'Apt 2 electricity' },
  { id: 'w0', unitId: null, kind: 'water' as const, name: 'Main water' },
];
const r = (meterId: string, period: string, value: number) => ({ meterId, period, value });

describe('attentionItems', () => {
  it('flags a rented unit that has not reported, but not a vacant unit or a main meter', () => {
    const items = attentionItems({ period: '2026-10-01', units, meters, readings: [], statements: [] });
    expect(items).toEqual([{ type: 'noReport', unitId: 'u1', meterId: 'e1', kind: 'electricity' }]);
  });

  it('does not flag a unit that reported', () => {
    const items = attentionItems({ period: '2026-10-01', units, meters, readings: [r('e1', '2026-10-01', 500)], statements: [] });
    expect(items).toEqual([]);
  });

  it('lists unpaid approved months only', () => {
    const items = attentionItems({
      period: '2026-10-01',
      units,
      meters: [],
      readings: [],
      statements: [
        { unitId: 'u1', period: '2026-09-01', total: 40000, paid: false },
        { unitId: 'u1', period: '2026-08-01', total: 39000, paid: true },
      ],
    });
    expect(items).toEqual([{ type: 'unpaid', unitId: 'u1', period: '2026-09-01', total: 40000 }]);
  });

  // usage per month: Jul 100, Aug 100, Sep 100 (readings 0,100,200,300), October jumps by 200
  const history = [r('e1', '2026-06-01', 0), r('e1', '2026-07-01', 100), r('e1', '2026-08-01', 200), r('e1', '2026-09-01', 300)];

  it('flags usage more than 40% above the recent average', () => {
    const items = attentionItems({ period: '2026-10-01', units, meters, readings: [...history, r('e1', '2026-10-01', 500)], statements: [] });
    expect(items).toEqual([{ type: 'highUsage', meterId: 'e1', unitId: 'u1', kind: 'electricity', usage: 200, average: 100 }]);
  });

  it('does not flag normal usage, or a meter with too little history', () => {
    expect(attentionItems({ period: '2026-10-01', units, meters, readings: [...history, r('e1', '2026-10-01', 430)], statements: [] })).toEqual([]);
    const short = [r('e1', '2026-08-01', 0), r('e1', '2026-09-01', 100), r('e1', '2026-10-01', 400)];
    expect(attentionItems({ period: '2026-10-01', units, meters, readings: short, statements: [] })).toEqual([]);
  });
});
