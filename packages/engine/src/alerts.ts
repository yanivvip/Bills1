export interface AlertContract {
  unitId: string;
  /** YYYY-MM-DD, null for an open-ended contract */
  endDate: string | null;
}

export interface EndingContract {
  unitId: string;
  endDate: string;
  /** whole days from today until the last day of the contract */
  days: number;
}

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** Active contracts whose last day is within `withinDays` of today (default 60), soonest first. Open-ended contracts never end. */
export function contractsEnding(contracts: readonly AlertContract[], today: string, withinDays = 60): EndingContract[] {
  return contracts
    .flatMap((c) => {
      if (!c.endDate) return [];
      const days = dayNumber(c.endDate) - dayNumber(today);
      return days >= 0 && days <= withinDays ? [{ unitId: c.unitId, endDate: c.endDate, days }] : [];
    })
    .sort((a, b) => a.days - b.days);
}
