export interface Reading {
  prev: number;
  cur: number;
}

/** Consumption for one meter. A reading that goes backwards is a data error. */
export function consumption(r: Reading): number {
  if (r.cur < r.prev) throw new RangeError(`reading went backwards (${r.prev} -> ${r.cur})`);
  return r.cur - r.prev;
}

/**
 * Usage of a parent meter that is not accounted for by its sub-meters
 * (the owner's own share when tenants have sub-meters). Never negative.
 */
export function netUsage(parent: Reading, children: readonly Reading[]): number {
  const total = consumption(parent) - children.reduce((s, c) => s + consumption(c), 0);
  return Math.max(0, total);
}
