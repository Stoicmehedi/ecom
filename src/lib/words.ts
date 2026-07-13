/**
 * Amount in words, for a receipt or an invoice (BLUEPRINT §20.4).
 *
 * A bill says "1,450.00" in digits and "One Thousand Four Hundred Fifty" in words
 * for the same reason a cheque does: a digit can be altered with a pen, a sentence
 * cannot. Both must say the same thing, so this is the only place that decides.
 *
 * The scale is the **international** one (thousand / million), not the South-Asian
 * lakh–crore one. If the shop wants lakhs, that is a settings decision and a second
 * scale table — not a rewrite.
 */

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

/** 0–999 in words. */
function underThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t} ${ONES[r]}` : t;
  }
  const h = `${ONES[Math.floor(n / 100)]} Hundred`;
  const r = n % 100;
  return r ? `${h} ${underThousand(r)}` : h;
}

const SCALES: [number, string][] = [
  [1_000_000_000, "Billion"],
  [1_000_000, "Million"],
  [1_000, "Thousand"],
];

/** A whole number in words. */
export function numberToWords(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "Zero";
  if (n < 0) return `Minus ${numberToWords(-n)}`;

  let rest = Math.floor(n);
  const parts: string[] = [];

  for (const [value, name] of SCALES) {
    const count = Math.floor(rest / value);
    if (count > 0) {
      parts.push(`${numberToWords(count)} ${name}`);
      rest -= count * value;
    }
  }

  const tail = underThousand(rest);
  if (tail) parts.push(tail);
  return parts.join(" ");
}

/**
 * A money amount in words, the way a bill says it:
 *   1450.00 → "One Thousand Four Hundred Fifty TK Only"
 *   1450.75 → "One Thousand Four Hundred Fifty TK and Seventy Five Paisa Only"
 *
 * The currency word comes from settings, so the receipt speaks the shop's language
 * rather than ours (§20.5).
 */
export function amountInWords(amount: number, currencyWord = "TK"): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);

  const whole = Math.floor(abs + 1e-9);
  // Round the fraction rather than truncating it: 0.999 is a cent, not nothing.
  const fraction = Math.round((abs - whole) * 100);

  // A fraction that rounds up to a whole unit belongs to the whole part.
  const [w, f] = fraction === 100 ? [whole + 1, 0] : [whole, fraction];

  let out = `${numberToWords(w)} ${currencyWord}`;
  if (f > 0) out += ` and ${numberToWords(f)} Paisa`;
  out += " Only";

  return negative ? `Minus ${out}` : out;
}
