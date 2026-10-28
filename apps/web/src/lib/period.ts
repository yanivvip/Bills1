// A reporting period is the first day of a month, as 'YYYY-MM-01'.
export const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export const shiftMonth = (period: string, delta: number) => {
  const [y = 0, m = 1] = period.split('-').map(Number);
  return monthStart(new Date(y, m - 1 + delta, 1));
};

export const monthLabel = (period: string, lang: string) =>
  new Date(`${period}T00:00:00`).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
