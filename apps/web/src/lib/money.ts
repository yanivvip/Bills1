// Money is stored as whole agorot; these helpers only convert for display and input.
export const formatMoney = (agorot: number, lang = 'he') =>
  `₪${(agorot / 100).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "12.5" -> 1250 agorot; null when the text is not a number. */
export const parseAgorot = (text: string): number | null => {
  const n = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** A rate in agorot per unit (may be fractional) as shekels text, e.g. 454.3 -> "4.543". */
export const rateToShekels = (agorot: number) => String(Number((agorot / 100).toFixed(4)));

/** "4.543" -> 454.3 agorot per unit; null when invalid. */
export const parseRate = (text: string): number | null => {
  const n = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100 * 10000) / 10000 : null;
};
