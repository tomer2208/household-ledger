import { Text, type TextProps } from 'react-native';

import { isolate } from '@/lib/bidi';
import { wholeUnits } from '@/lib/envelope';
import { formatMoney } from '@/lib/money';
import { moneyText } from '@/lib/theme';

// F3: an amount, the way every screen should show one. Rubik with tabular digits; whole shekels
// unless `exact` (a single expense's details); isolated, so inside a Hebrew sentence the ₪ and a
// full stop stay where they belong. Negative amounts are the caller's to say in words ("over by").
export function money(minor: number, currency: string, exact = false) {
  return isolate(formatMoney(exact ? minor : wholeUnits(minor), currency));
}

export function MoneyText({
  minor,
  currency,
  exact,
  style,
  ...props
}: TextProps & { minor: number; currency: string; exact?: boolean }) {
  return (
    <Text {...props} style={[moneyText, style]}>
      {money(minor, currency, exact)}
    </Text>
  );
}
