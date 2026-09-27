// Parses the amount string exactly as the Wallet trigger hands it over.
// The format is not documented and differs by locale, so the parser accepts every
// shape we could plausibly get and returns null instead of guessing on anything else.

export type ParsedAmount = { minor: number; currency: string };

const SYMBOLS: Record<string, string> = { "₪": "ILS", "$": "USD", "€": "EUR", "£": "GBP" };

export function parseAmount(input: string, fallbackCurrency: string): ParsedAmount | null {
  let s = String(input ?? "")
    .normalize("NFKC")
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/[  ]/g, " ")
    .trim();
  if (!s) return null;

  let currency: string | null = null;

  if (/ש["״]?ח/.test(s)) {
    currency = "ILS";
    s = s.replace(/ש["״]?ח/g, " ");
  }
  for (const [symbol, code] of Object.entries(SYMBOLS)) {
    if (s.includes(symbol)) {
      currency ??= code;
      s = s.split(symbol).join(" ");
    }
  }
  const code = s.match(/(?:^|[^A-Za-z])([A-Za-z]{3})(?:[^A-Za-z]|$)/);
  if (code) {
    currency ??= code[1].toUpperCase();
    s = s.replace(code[1], " ");
  }

  s = s.trim();
  const negative = /^[-−]|[-−]$|^\(.*\)$/.test(s);
  const digits = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(digits)) return null;

  const minor = toMinor(digits);
  if (minor === null || minor === 0) return null;
  return { minor: negative ? -minor : minor, currency: currency ?? fallbackCurrency };
}

// "1,234.50" "1.234,50" "45,90" "1,234" "1234" → minor units (2 decimals).
function toMinor(n: string): number | null {
  const lastDot = n.lastIndexOf(".");
  const lastComma = n.lastIndexOf(",");
  let intPart: string;
  let fracPart = "";

  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    intPart = n.slice(0, dec).replace(/[.,]/g, "");
    fracPart = n.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = n.split(sep);
    const tail = parts[parts.length - 1];
    // One separator followed by 1-2 digits is a decimal point; anything else groups thousands.
    if (parts.length === 2 && tail.length >= 1 && tail.length <= 2) {
      intPart = parts[0];
      fracPart = tail;
    } else {
      intPart = parts.join("");
    }
  } else {
    intPart = n;
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || fracPart.length > 2) return null;
  const whole = Number(intPart || "0");
  const cents = Number((fracPart + "00").slice(0, 2));
  if (!Number.isSafeInteger(whole)) return null;
  return whole * 100 + cents;
}
