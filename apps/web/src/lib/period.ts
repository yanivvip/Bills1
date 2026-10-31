// A reporting period is the first day of a month, as 'YYYY-MM-01'.
export const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());

// Suggested reading date for a month: today for the current month, otherwise the last day of that month.
export const defaultReadDate = (period: string) => {
  const t = today();
  if (t.startsWith(period.slice(0, 7))) return t;
  const [y = 0, m = 1] = period.split('-').map(Number);
  return iso(new Date(y, m, 0));
};

export const shiftMonth = (period: string, delta: number) => {
  const [y = 0, m = 1] = period.split('-').map(Number);
  return monthStart(new Date(y, m - 1 + delta, 1));
};

export const monthLabel = (period: string, lang: string) =>
  new Date(`${period}T00:00:00`).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
