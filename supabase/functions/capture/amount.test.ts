// Run: node --test supabase/functions/capture/amount.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount } from "./amount.ts";

const cases: Array<[string, number, string] | [string, null]> = [
  ["₪45.90", 4590, "ILS"],
  ["45.90 ₪", 4590, "ILS"],
  ["‏₪45.90", 4590, "ILS"],
  ["ILS 45.90", 4590, "ILS"],
  ["45,90 ₪", 4590, "ILS"],
  ['45.90 ש"ח', 4590, "ILS"],
  ["$12.00", 1200, "USD"],
  ["€7,5", 750, "EUR"],
  ["USD 1,234.50", 123450, "USD"],
  ["1.234,50 €", 123450, "EUR"],
  ["₪1,234", 123400, "ILS"],
  ["1234", 123400, "ILS"],
  ["12.3", 1230, "ILS"],
  ["-₪20.00", -2000, "ILS"],
  ["₪ 2,500.00", 250000, "ILS"],
  ["", null],
  ["abc", null],
  ["₪0.00", null],
];

for (const c of cases) {
  test(`parseAmount(${JSON.stringify(c[0])})`, () => {
    const got = parseAmount(c[0], "ILS");
    if (c[1] === null) assert.equal(got, null);
    else assert.deepEqual(got, { minor: c[1], currency: c[2] });
  });
}
