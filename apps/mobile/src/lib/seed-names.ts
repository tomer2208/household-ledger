// The categories every household starts with (migration 34, create_household), in both languages.
// D1 / P2: a household created in English and used in Hebrew shows "Groceries" in a Hebrew screen;
// the categories screen offers to rename the seeded ones that still have the other language's name.
export const SEED_NAMES: [en: string, he: string][] = [
  ['Groceries', 'סופרמרקט'], ['Dining', 'אוכל בחוץ'], ['Transport', 'תחבורה'], ['Fuel', 'דלק'],
  ['Housing', 'דיור'], ['Utilities', 'חשבונות'], ['Health', 'בריאות'], ['Kids', 'ילדים'],
  ['Shopping', 'קניות'], ['Entertainment', 'בילויים'], ['Subscriptions', 'מנויים'], ['Travel', 'חופשות'],
  ['Gifts', 'מתנות'], ['Education', 'חינוך'], ['Other', 'אחר'], ['Savings', 'חיסכון'],
];

// The name a seeded category would have in `to`, or null when it isn't a seeded name in the other language.
export function translatedSeedName(name: string, to: 'en' | 'he') {
  const row = SEED_NAMES.find(([en, he]) => (to === 'he' ? en === name : he === name));
  return row ? (to === 'he' ? row[1] : row[0]) : null;
}
