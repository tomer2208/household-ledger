import { Share } from 'react-native';

import { buildExpensesCsv } from './export-csv.shared';

// Native: the share sheet (Files, Mail, Notes...).
export async function exportExpenses(names: Map<string, string>) {
  const csv = await buildExpensesCsv(names);
  await Share.share({ title: 'expenses.csv', message: csv });
}
