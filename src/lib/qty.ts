/**
 * Whole vs decimal units (BLUEPRINT §21).
 *
 * A shirt is one object. It cannot be cut in half, so `0.5` of it is not a
 * quantity — it is a typo that becomes permanent: half a shirt lands in stock,
 * in the stock valuation and in every report that reads them, and it can never
 * leave, because the till will only sell whole ones.
 *
 * Fabric by the metre and rice by the kilo are the opposite: `2.5` is ordinary.
 * So the rule cannot live in the screen. It lives on the **unit**, and this file
 * is the single copy of it — called by the forms so a fraction cannot be typed,
 * and by the server so one cannot be sent.
 */

/** The bit of a unit that matters here. `null` = no unit set. */
export type UnitRule = { name?: string | null; allowDecimal: boolean } | null;

/**
 * May this product's quantity carry a fraction?
 *
 * A product with **no unit is treated as whole** — the safe default. An unset
 * field must never be a licence to create fractional stock.
 */
export function allowsDecimal(unit: UnitRule): boolean {
  return unit?.allowDecimal ?? false;
}

/** What a qty input's `step` should be, so the browser itself refuses a fraction. */
export function qtyStep(unit: UnitRule): string {
  return allowsDecimal(unit) ? "0.001" : "1";
}

/** True when `qty` is a whole number, within floating-point tolerance. */
export function isWhole(qty: number): boolean {
  return Math.abs(qty - Math.round(qty)) < 0.0005;
}

/**
 * Check one quantity against its unit. Returns an error message, or null.
 *
 * `label` names the thing in the message — a SKU or a product name — because
 * "Quantity must be a whole number" on a 40-line purchase is not an error
 * message, it is a puzzle.
 */
export function checkQty(qty: number, unit: UnitRule, label: string): string | null {
  if (allowsDecimal(unit)) return null;
  if (isWhole(qty)) return null;
  const name = unit?.name?.trim();
  return name
    ? `"${label}" is sold in whole ${name.toLowerCase()}s — ${qty} is not a whole number.`
    : `"${label}" is sold in whole units — ${qty} is not a whole number.`;
}

/**
 * Check a whole document's lines in one pass. Returns the first error, or null.
 *
 * Every write that moves stock — purchase, purchase return, sale, sale return,
 * exchange, stock adjustment — funnels through this on the server, whatever the
 * browser sent. A rule the browser can talk around is not a rule (§12.7a).
 */
export function checkQtyLines(
  lines: { qty: number; unit: UnitRule; label: string }[],
): string | null {
  for (const line of lines) {
    const err = checkQty(line.qty, line.unit, line.label);
    if (err) return err;
  }
  return null;
}
