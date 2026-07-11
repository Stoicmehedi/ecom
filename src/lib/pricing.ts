/**
 * How a sale line is priced. ONE place, because three different discounts can
 * touch one line and the screen and the server must never disagree about the
 * answer (BLUEPRINT §12.7a).
 *
 *   unit price    = wholesale qty reached ? wholesalePrice : sellingPrice
 *   auto discount = max(the variant's own discount, the customer group's rate)
 *                     ← the BEST one. They never stack.
 *   effective     = unit price − auto discount    …refused if < minSalePrice
 *
 * The cashier's manual bill discount is applied afterwards, at the bill level,
 * and replaces the automatic one rather than adding to it.
 */

import { round2 } from "./costing";

export type PricingInput = {
  sellingPrice: number;
  wholesalePrice?: number | null;
  wholesaleQty?: number | null;
  /** The variant's own standing discount. */
  discountType?: "AMOUNT" | "PERCENT";
  discountValue?: number | null;
  /** The customer's group rate, as a percentage. */
  groupDiscountPct?: number | null;
  /** The floor, from the product. */
  minSalePrice?: number | null;
  qty: number;
};

export type LinePrice = {
  /** What the catalogue says — before any discount, after any wholesale switch. */
  listPrice: number;
  /** What we actually charge per unit. */
  price: number;
  /** listPrice − price, per unit. */
  discountPerUnit: number;
  /** The whole line's discount. */
  discount: number;
  subtotal: number;
  isWholesale: boolean;
  /** Which discount won — for showing the cashier why. */
  source: "none" | "variant" | "group";
  /** Set when the price would fall below the product's floor. */
  belowMin: boolean;
  minSalePrice: number | null;
};

const pct = (base: number, p: number) => (base * p) / 100;

/** The reduction a variant's own standing discount is worth, per unit. */
function variantDiscount(base: number, i: PricingInput): number {
  const v = Number(i.discountValue ?? 0);
  if (v <= 0) return 0;
  const raw = i.discountType === "PERCENT" ? pct(base, v) : v;
  return Math.min(Math.max(raw, 0), base);
}

export function priceLine(i: PricingInput): LinePrice {
  const qty = Number(i.qty) || 0;

  // Wholesale first: it changes the base every later discount is measured against.
  const wQty = Number(i.wholesaleQty ?? 0);
  const wPrice = Number(i.wholesalePrice ?? 0);
  const isWholesale = wQty > 0 && wPrice > 0 && qty >= wQty;
  const listPrice = round2(isWholesale ? wPrice : Number(i.sellingPrice) || 0);

  const fromVariant = variantDiscount(listPrice, i);
  const groupPct = Number(i.groupDiscountPct ?? 0);
  const fromGroup = groupPct > 0 ? Math.min(pct(listPrice, groupPct), listPrice) : 0;

  // The best single discount wins — never both.
  let discountPerUnit = 0;
  let source: LinePrice["source"] = "none";
  if (fromVariant > 0 || fromGroup > 0) {
    if (fromVariant >= fromGroup) {
      discountPerUnit = fromVariant;
      source = "variant";
    } else {
      discountPerUnit = fromGroup;
      source = "group";
    }
  }
  discountPerUnit = round2(discountPerUnit);

  const price = round2(listPrice - discountPerUnit);

  const min = i.minSalePrice == null ? null : Number(i.minSalePrice);
  // A floor of 0 is not a floor — treat it as "not set".
  const hasMin = min != null && min > 0;
  const belowMin = hasMin && price < min - 0.005;

  return {
    listPrice,
    price,
    discountPerUnit,
    discount: round2(discountPerUnit * qty),
    subtotal: round2(price * qty),
    isWholesale,
    source,
    belowMin,
    minSalePrice: hasMin ? min : null,
  };
}
