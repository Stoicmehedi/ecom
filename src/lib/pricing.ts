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
 *
 * A line marked FREE (a QC write-off / free issue, BLUEPRINT §16) sits outside all
 * of it: price 0, no floor. That is deliberate — it is the one way goods leave at
 * zero, it is Admin-only, and it must be declared rather than typed into a price box.
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
  /**
   * A free issue / QC write-off (BLUEPRINT §16). The goods leave at 0.00 and the
   * floor does not apply — a declared give-away, never a price a cashier typed.
   */
  isFree?: boolean;
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
  source: "none" | "variant" | "group" | "free";
  /** Set when the price would fall below the product's floor. */
  belowMin: boolean;
  minSalePrice: number | null;
  /** A free issue — the goods left at 0.00 on purpose (BLUEPRINT §16). */
  isFree: boolean;
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

  // A free issue is a declared give-away, not the bottom of the discount ladder:
  // it skips every discount and the floor alike (BLUEPRINT §16.1). `listPrice`
  // still carries what the goods were worth, so the loss is visible rather than
  // the goods looking worthless.
  if (i.isFree) {
    return {
      listPrice,
      price: 0,
      discountPerUnit: listPrice,
      discount: round2(listPrice * qty),
      subtotal: 0,
      isWholesale,
      source: "free",
      belowMin: false,
      minSalePrice: null,
      isFree: true,
    };
  }

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
    isFree: false,
  };
}
