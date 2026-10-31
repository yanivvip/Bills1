import type { Agorot } from './money.js';
import type { BillLine } from './bill.js';

export interface KindReconciliation {
  /** what was billed to the renters for this utility */
  collected: Agorot;
  /** what the utility company charged the landlord (null when not entered yet) */
  supplier: Agorot | null;
  /** supplier minus collected: positive = the landlord paid more than was billed to renters */
  difference: Agorot | null;
}

export interface Reconciliation {
  electricity: KindReconciliation;
  water: KindReconciliation;
}

/** Billed to renters (all units of the month) against the supplier bills. */
export function reconcile(statements: readonly (readonly BillLine[])[], supplier: { electricity?: Agorot | null; water?: Agorot | null }): Reconciliation {
  let e = 0;
  let w = 0;
  for (const lines of statements) {
    for (const l of lines) {
      if (l.type === 'electricity' || l.type === 'electricityFixed') e += l.amount;
      if (l.type === 'waterA' || l.type === 'waterB') w += l.amount;
    }
  }
  const make = (collected: Agorot, sup: Agorot | null | undefined): KindReconciliation => ({
    collected,
    supplier: sup ?? null,
    difference: sup == null ? null : sup - collected,
  });
  return { electricity: make(e, supplier.electricity), water: make(w, supplier.water) };
}
