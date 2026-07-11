/**
 * Inventory costing — weighted-average cost.
 *
 * Stock is valued at a moving weighted average: each purchase pulls the average
 * toward the price actually paid, proportional to how much it adds. Reversing a
 * purchase (delete or return) un-winds exactly that contribution.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * New weighted-average cost after receiving `addQty` at `price`.
 * Negative existing stock is floored at 0 so it can't skew the average.
 */
export function avgAfterPurchase(
  stockQty: number,
  avgCost: number,
  addQty: number,
  price: number,
): number {
  const base = Math.max(stockQty, 0);
  const denom = base + addQty;
  if (denom <= 0) return round2(price);
  return round2((base * avgCost + addQty * price) / denom);
}

/**
 * New weighted-average cost after removing `removeQty` that was received at `price`
 * (purchase deleted, or goods returned to the supplier).
 *
 * With no stock left the average is meaningless, so the previous one is kept.
 */
export function avgAfterReversal(
  stockQty: number,
  avgCost: number,
  removeQty: number,
  price: number,
): number {
  const remaining = stockQty - removeQty;
  if (remaining <= 0) return round2(avgCost);
  const value = stockQty * avgCost - removeQty * price;
  return value > 0 ? round2(value / remaining) : round2(avgCost);
}

/** Resolve an order-level discount to a currency amount. */
export function resolveDiscount(
  subtotal: number,
  type: "AMOUNT" | "PERCENT",
  value: number,
): number {
  const raw = type === "PERCENT" ? (subtotal * value) / 100 : value;
  return round2(Math.min(Math.max(raw, 0), subtotal));
}

/** Payment status implied by what's still owed. */
export function docStatus(total: number, paid: number): "PAID" | "PARTIAL" | "DUE" {
  if (paid >= total - 0.005) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "DUE";
}
