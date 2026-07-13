import { avgAfterPurchase, paidRatio, round2, round3 } from "@/lib/costing";
import { pointsToReverse, pointsValue, type LoyaltySettings } from "@/lib/loyalty";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type ReturnLine = { saleItemId: number; qty: number };

/** The bits of a sale this module needs, whoever loaded it. */
export type ReturnableSale = {
  id: number;
  invoiceNo: string;
  customerId: number | null;
  subtotal: unknown;
  discount: unknown;
  total: unknown;
  pointsEarned: number;
  pointsRedeemed: number;
  items: {
    id: number;
    variantId: number;
    qty: unknown;
    returnedQty: unknown;
    price: unknown;
    costAtSale: unknown;
    variant: { sku: string };
  }[];
};

export type PointsMovement = {
  /** Earned points clawed back with the goods (§15.5). Positive = this many go away. */
  reversed: number;
  /** Points the customer SPENT on this sale, handed back with the goods. */
  restored: number;
  /** What those restored points are worth — the money credit shrinks by exactly this. */
  restoredValue: number;
};

/**
 * The points side of a return (BLUEPRINT §15.5), in proportion to what is coming back.
 *
 * Two movements, and the second one is the one that is easy to miss:
 *
 *  1. **Earned points reverse.** Buy → earn → return → keep the points is free money.
 *
 *  2. **Redeemed points come back as POINTS.** If a customer paid part of a bill with
 *     points and then returns the goods, refunding that part in *cash* would launder
 *     points into money — buy with points, return for cash, repeat. So they get their
 *     points back, and the money credit shrinks by exactly what those points were
 *     worth. The customer is made whole in the same instruments they paid with.
 */
export function pointsMovementFor(
  sale: ReturnableSale,
  creditedNow: number,
  settings: LoyaltySettings,
): PointsMovement {
  const total = Number(sale.total);
  const reversed = pointsToReverse(sale.pointsEarned, total, creditedNow);
  const restored = pointsToReverse(sale.pointsRedeemed, total, creditedNow);
  return { reversed, restored, restoredValue: pointsValue(restored, settings) };
}

/**
 * What one unit of a sold line is worth coming back.
 *
 * Not the list price: the bill's discount was shared across its lines in
 * proportion to line value, so a 12.00 shirt on a bill discounted 10% was really
 * sold for 10.80. Credit the list price and we hand back money never taken
 * (BLUEPRINT §10.1a). Because the ratio is the same for every line on the bill,
 * one number does the whole job.
 */
export function unitCredit(sale: ReturnableSale, item: { price: unknown }): number {
  return Number(item.price) * paidRatio(Number(sale.subtotal), Number(sale.discount));
}

/** How much of a line has not been sent back yet. */
export function returnableQty(item: { qty: unknown; returnedQty: unknown }): number {
  return round3(Number(item.qty) - Number(item.returnedQty));
}

/**
 * Check the lines against the sale. Returns an error message, or null.
 *
 * Split out from the write so both the standalone return screen and the POS
 * exchange panel refuse the same things for the same reasons.
 */
export function validateReturnLines(
  sale: ReturnableSale,
  lines: ReturnLine[],
): string | null {
  const byId = new Map(sale.items.map((i) => [i.id, i]));
  if (lines.length === 0) return "Enter a return quantity for at least one item.";

  for (const line of lines) {
    const item = byId.get(line.saleItemId);
    if (!item) return "That product is not on this sale.";

    const available = returnableQty(item);
    if (line.qty > available + 0.0005) {
      return `You can return at most ${available} of "${item.variant.sku}" — the rest is already returned.`;
    }
  }
  return null;
}

/** The value of the goods coming back, at what the customer actually paid. */
export function creditFor(sale: ReturnableSale, lines: ReturnLine[]): number {
  const byId = new Map(sale.items.map((i) => [i.id, i]));
  return round2(
    lines.reduce((s, l) => s + l.qty * unitCredit(sale, byId.get(l.saleItemId)!), 0),
  );
}

async function nextReturnNo(tx: Tx): Promise<string> {
  const last = await tx.saleReturn.findFirst({
    orderBy: { id: "desc" },
    select: { returnNo: true },
  });
  const n = last ? parseInt(last.returnNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `SRT-${String(n + 1).padStart(5, "0")}`;
}

/**
 * Write the return: the document, its lines, the stock coming back, and the
 * audit trail. Deliberately does NOT touch the customer's balance or move any
 * money — those differ between a plain return (refund or credit) and an exchange
 * (the credit is spent on the spot), so the caller owns them.
 *
 * Returns the new return's id and the credit it is worth.
 */
export async function writeSaleReturn(
  tx: Tx,
  args: {
    sale: ReturnableSale;
    lines: ReturnLine[];
    date: Date;
    note?: string | null;
    /** Recorded on the document; the caller is responsible for actually paying it. */
    refunded?: number;
    settings: LoyaltySettings;
  },
): Promise<{
  id: number;
  returnNo: string;
  /** The goods' worth at what the customer paid. */
  total: number;
  points: PointsMovement;
  /** `total` minus the value of the points handed back — what the caller must settle in money. */
  payable: number;
}> {
  const { sale, lines, date, settings } = args;
  const byId = new Map(sale.items.map((i) => [i.id, i]));
  const total = creditFor(sale, lines);
  const points = pointsMovementFor(sale, total, settings);
  const payable = round2(total - points.restoredValue);

  const ret = await tx.saleReturn.create({
    data: {
      returnNo: await nextReturnNo(tx),
      saleId: sale.id,
      customerId: sale.customerId,
      date,
      note: args.note?.trim() || null,
      total,
      moneyCredit: payable,
      refunded: round2(args.refunded ?? 0),
      pointsReversed: points.reversed,
    },
  });

  // The points side (§15.5). Both movements are recorded as their own ledger rows,
  // because a balance nobody can explain is a balance nobody can trust.
  if (sale.customerId) {
    if (points.reversed > 0) {
      await tx.pointEntry.create({
        data: {
          contactId: sale.customerId,
          saleReturnId: ret.id,
          points: -points.reversed,
          type: "REVERSE",
          note: `Earned points taken back with the goods (${ret.returnNo})`,
        },
      });
    }
    if (points.restored > 0) {
      await tx.pointEntry.create({
        data: {
          contactId: sale.customerId,
          saleReturnId: ret.id,
          points: points.restored,
          type: "REVERSE",
          note: `Points spent on ${sale.invoiceNo} given back (${ret.returnNo})`,
        },
      });
    }
    const delta = points.restored - points.reversed;
    if (delta !== 0) {
      await tx.contact.update({
        where: { id: sale.customerId },
        data: { loyaltyPoints: { increment: delta } },
      });
    }
  }

  for (const line of lines) {
    const item = byId.get(line.saleItemId)!;
    const price = unitCredit(sale, item);
    const cost = Number(item.costAtSale);

    await tx.saleReturnItem.create({
      data: {
        returnId: ret.id,
        saleItemId: item.id,
        variantId: item.variantId,
        qty: round3(line.qty),
        price: round2(price),
        cost: round2(cost),
        subtotal: round2(line.qty * price),
      },
    });

    await tx.saleItem.update({
      where: { id: item.id },
      data: { returnedQty: { increment: round3(line.qty) } },
    });

    // Back on the shelf at the cost it left at — not today's average, which would
    // silently rewrite what this stock is worth.
    const v = await tx.productVariant.findUniqueOrThrow({
      where: { id: item.variantId },
      select: { stockQty: true, purchasePrice: true },
    });
    const stock = Number(v.stockQty);
    await tx.productVariant.update({
      where: { id: item.variantId },
      data: {
        stockQty: round3(stock + line.qty),
        purchasePrice: avgAfterPurchase(stock, Number(v.purchasePrice), line.qty, cost),
      },
    });

    await tx.stockMovement.create({
      data: {
        variantId: item.variantId,
        type: "SALE_RETURN",
        qty: round3(line.qty),
        refType: "sale_return",
        refId: ret.id,
        note: `Return against ${sale.invoiceNo}`,
      },
    });
  }

  return { id: ret.id, returnNo: ret.returnNo, total, points, payable };
}
