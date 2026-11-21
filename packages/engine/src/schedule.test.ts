import { describe, expect, it } from 'vitest';
import { isDueMonth, monthsBetween } from './schedule.js';

describe('isDueMonth', () => {
  it('a monthly bill is due every month', () => {
    expect(isDueMonth(1, null, '2026-11-01')).toBe(true);
    expect(isDueMonth(1, '2026-01-01', '2026-02-01')).toBe(true);
  });
  it('a bimonthly bill is due in the anchor month and every second month, also across years and before the anchor', () => {
    expect(isDueMonth(2, '2026-10-01', '2026-10-01')).toBe(true);
    expect(isDueMonth(2, '2026-10-01', '2026-11-01')).toBe(false);
    expect(isDueMonth(2, '2026-10-01', '2026-12-01')).toBe(true);
    expect(isDueMonth(2, '2026-10-01', '2027-02-01')).toBe(true);
    expect(isDueMonth(2, '2026-10-01', '2027-03-01')).toBe(false);
    expect(isDueMonth(2, '2026-10-01', '2026-08-01')).toBe(true);
    expect(isDueMonth(2, '2026-10-01', '2026-09-01')).toBe(false);
  });
  it('a bimonthly bill without an anchor is never due', () => {
    expect(isDueMonth(2, null, '2026-11-01')).toBe(false);
  });
  it('counts months across a year boundary', () => {
    expect(monthsBetween('2026-11-01', '2027-02-01')).toBe(3);
  });
});
