"use server";

import { prisma } from "@/lib/prisma";
import { returnableQty, unitCredit } from "@/lib/sale-return";
import { round2, round3 } from "@/lib/costing";

/** One line of the original invoice, as the exchange panel needs to show it. */
export type ExchangeLine = {
  saleItemId: number;
  variantId: number;
  label: string;
  sku: string;
  soldQty: number;
  /** Sold minus already-returned — the most that can still come back. */
  returnable: number;
  /** What one unit is worth back, at what the customer actually paid for it. */
  unitPrice: number;
  /** Whether half of this can come back — a shirt's cannot (BLUEPRINT §21). */
  allowDecimal: boolean;
};

export type ExchangeSale = {
  saleId: number;
  invoiceNo: string;
  date: string;
  customerId: number | null;
  customerName: string;
  lines: ExchangeLine[];
};

/**
 * Look up the invoice the customer is handing goods back against.
 *
 * An invoice is required: we will not credit goods we cannot trace to a sale.
 * The scanned barcode of the item itself is accepted too — but only to find the
 * invoice it was sold on, never to conjure a credit out of nothing.
 */
export async function findSaleForExchange(
  term: string,
): Promise<{ sale?: ExchangeSale; error?: string }> {
  const q = term.trim();
  if (!q) return { error: "Enter an invoice number." };

  const sale = await prisma.sale.findFirst({
    where: {
      OR: [
        { invoiceNo: { equals: q, mode: "insensitive" } },
        { invoiceNo: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { id: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      items: {
        include: {
          variant: {
            select: {
              sku: true,
              label: true,
              product: {
                select: {
                  name: true,
                  // The exchange panel takes its qty `step` from the unit (§21).
                  unit: { select: { name: true, allowDecimal: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sale) return { error: `No sale found for "${q}".` };

  const lines: ExchangeLine[] = sale.items
    .map((i) => ({
      saleItemId: i.id,
      variantId: i.variantId,
      label: i.variant.label
        ? `${i.variant.product.name} — ${i.variant.label}`
        : i.variant.product.name,
      sku: i.variant.sku,
      soldQty: Number(i.qty),
      returnable: returnableQty(i),
      unitPrice: round2(unitCredit(sale, i)),
      allowDecimal: i.variant.product.unit?.allowDecimal ?? false,
    }))
    .filter((l) => l.returnable > 0);

  if (lines.length === 0) {
    return { error: `Everything on ${sale.invoiceNo} has already been returned.` };
  }

  return {
    sale: {
      saleId: sale.id,
      invoiceNo: sale.invoiceNo,
      date: sale.date.toISOString().slice(0, 10),
      customerId: sale.customerId,
      customerName: sale.customer?.name ?? "Walk-in customer",
      lines,
    },
  };
}

/** What the goods being handed back are worth — recomputed, never trusted from the client. */
export async function quoteExchangeCredit(
  saleId: number,
  lines: { saleItemId: number; qty: number }[],
): Promise<number> {
  const picked = lines.filter((l) => l.qty > 0);
  if (picked.length === 0) return 0;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: { include: { variant: { select: { sku: true } } } } },
  });
  if (!sale) return 0;

  const byId = new Map(sale.items.map((i) => [i.id, i]));
  return round2(
    picked.reduce((s, l) => {
      const item = byId.get(l.saleItemId);
      if (!item) return s;
      return s + round3(l.qty) * unitCredit(sale, item);
    }, 0),
  );
}
