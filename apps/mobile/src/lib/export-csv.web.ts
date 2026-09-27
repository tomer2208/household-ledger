import { buildExpensesCsv } from './export-csv.shared';

// Web: a real file download. The BOM makes Excel read Hebrew merchant names correctly.
export async function exportExpenses(names: Map<string, string>) {
  const csv = await buildExpensesCsv(names);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `household-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
