// P1-2: the same split create_installments makes on the server (migration 33), for showing it
// before saving: equal shares, with the agorot left over on the first payment.
export const INSTALLMENT_CHOICES = [1, 3, 6, 10, 12, 18, 24, 36] as const;

export function splitInstallments(totalMinor: number, count: number) {
  const share = Math.floor(totalMinor / count);
  return { first: totalMinor - share * (count - 1), share };
}

// Payments made so far on an installment rule: the months from payment 1 up to (not including)
// the next scheduled run. Both dates are 'YYYY-MM-DD'.
export function installmentsPaid(first: string, nextRun: string | null, count: number) {
  if (!nextRun) return count;
  const months = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  return Math.min(count, Math.max(1, months(nextRun) - months(first)));
}

// Which payment an expense is: from the list (search_transactions) or, on its details, from the
// embedded rule and its recurring_period. Null when it isn't an installment.
export function installmentNo(t: {
  installment?: { no: number; count: number } | null;
  recurring_period?: string | null;
  recurring_rules?: { installment_count: number | null; installment_first: string | null } | null;
}) {
  if (t.installment) return t.installment;
  const r = t.recurring_rules;
  if (!r?.installment_count || !r.installment_first || !t.recurring_period) return null;
  const months = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  return { no: months(t.recurring_period) - months(r.installment_first) + 1, count: r.installment_count };
}
