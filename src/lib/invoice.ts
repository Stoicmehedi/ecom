/**
 * The invoice, loaded once (BLUEPRINT §20).
 *
 * Three surfaces render a sale to a customer — the 80mm receipt, the A4 invoice, and
 * the public shared link. If each fetched its own data, they would drift, and a shop
 * whose receipt and invoice disagree has a problem it cannot argue its way out of.
 * So they all read this.
 *
 * **Nothing here is a cost or a profit.** This data leaves the building — it goes on
 * paper into a customer's hand and, on a shared link, to anyone holding the URL.
 * `costAtSale` must never appear on it.
 */

import { prisma } from "./prisma";
import { getSettings, type ShopSettings } from "./settings";
import { amountInWords } from "./words";
import { num } from "./format";

export type InvoiceDoc = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;

async function loadSale(where: { id: number } | { publicToken: string }) {
  return prisma.sale.findUnique({
    where: where as { id: number },
    select: {
      id: true,
      invoiceNo: true,
      date: true,
      subtotal: true,
      discount: true,
      discountType: true,
      discountValue: true,
      total: true,
      paid: true,
      due: true,
      status: true,
      note: true,
      tendered: true,
      pointsEarned: true,
      pointsRedeemed: true,
      publicToken: true,
      customer: { select: { name: true, phone: true, loyaltyPoints: true, isWalkIn: true } },
      soldBy: { select: { name: true } },
      payments: { select: { id: true, method: true, amount: true, date: true } },
      items: {
        select: {
          id: true,
          qty: true,
          price: true,
          subtotal: true,
          isFree: true,
          variant: {
            select: {
              sku: true,
              label: true,
              product: { select: { name: true, unit: { select: { shortName: true } } } },
            },
          },
        },
      },
      // NOTE: no costAtSale. This document leaves the building (§20).
    },
  });
}

/** The whole document: the sale, the shop it came from, and the words for the total. */
export async function loadInvoice(where: { id: number } | { publicToken: string }) {
  const [sale, settings] = await Promise.all([loadSale(where), getSettings()]);
  if (!sale) return null;

  const total = num(sale.total);
  const tendered = sale.tendered == null ? null : num(sale.tendered);

  return {
    sale,
    shop: settings as ShopSettings,
    totalInWords: amountInWords(total, settings.currencyWord),
    tendered,
    // Only meaningful when cash was actually handed over. A card sale has no change.
    change: tendered == null ? null : Math.max(tendered - num(sale.paid), 0),
    itemCount: sale.items.length,
    totalQty: sale.items.reduce((s, i) => s + num(i.qty), 0),
  };
}

/** The line as it should read on paper: "Classic Tee — Red / M". */
export function lineName(item: InvoiceDoc["sale"]["items"][number]): string {
  const { product, label } = item.variant;
  return label ? `${product.name} — ${label}` : product.name;
}

/**
 * The message that goes to WhatsApp (§20.5, "share" = both).
 *
 * Text, not a link — the customer already has the paper slip, and a message that
 * leaks nothing is the safe default. The public link is offered separately.
 */
export function shareText(doc: InvoiceDoc): string {
  const { sale, shop } = doc;
  const lines = sale.items.map((i) => {
    const price = i.isFree ? "FREE" : num(i.subtotal).toFixed(2);
    return `${num(i.qty)} × ${lineName(i)}  ${price}`;
  });

  const out = [
    `${shop.shopName} — Invoice ${sale.invoiceNo}`,
    sale.date.toLocaleDateString(),
    "",
    ...lines,
    "",
    `Total: ${num(sale.total).toFixed(2)}`,
    `Paid:  ${num(sale.paid).toFixed(2)}`,
  ];
  if (num(sale.due) > 0) out.push(`Due:   ${num(sale.due).toFixed(2)}`);
  if (sale.pointsEarned > 0) out.push(`Points earned: ${sale.pointsEarned}`);
  out.push("", "Thank you!");

  return out.join("\n");
}
