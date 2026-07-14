import { money, num, qty } from "@/lib/format";
import { lineName, type InvoiceDoc } from "@/lib/invoice";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOBILE: "Mobile banking",
  CARD: "Card",
  BANK: "Bank transfer",
  CHEQUE: "Cheque",
  POINTS: "Points",
  EXCHANGE: "Goods exchanged",
};

export const methodLabel = (m: string | null | undefined) =>
  METHOD_LABELS[m ?? ""] ?? m ?? "Paid";

export function ShopHeader({ shop }: { shop: InvoiceDoc["shop"] }) {
  return (
    <div className="text-center">
      <p className="text-base font-bold tracking-wide">{shop.shopName}</p>
      {shop.shopAddress && <p>{shop.shopAddress}</p>}
      {shop.shopPhone && <p>{shop.shopPhone}</p>}
      {shop.shopEmail && <p>{shop.shopEmail}</p>}
    </div>
  );
}

/**
 * The A4 invoice — the document you hand over, attach, or print to PDF.
 *
 * Same data as the 80mm receipt (both read `loadInvoice`), laid out for paper rather
 * than for a till roll. Carries no cost and no profit: it leaves the building (§20).
 */
export function A4Invoice({ doc }: { doc: InvoiceDoc }) {
  const { sale, shop, totalInWords, tendered, change, totalQty } = doc;

  // Date always; the time only if the shop wants it on the document (§27.3).
  const stamp = sale.date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(shop.showTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  });

  return (
    <div className="invoice mx-auto w-full max-w-3xl bg-white p-8 text-black">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{shop.shopName}</h1>
          {shop.shopAddress && <p className="text-sm">{shop.shopAddress}</p>}
          {shop.shopPhone && <p className="text-sm">{shop.shopPhone}</p>}
          {shop.shopEmail && <p className="text-sm">{shop.shopEmail}</p>}
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tracking-widest text-neutral-500">INVOICE</p>
          <p className="mt-1 font-semibold">{sale.invoiceNo}</p>
          <p className="text-sm">{stamp}</p>
          {sale.soldBy && <p className="text-sm">Sold by: {sale.soldBy.name}</p>}
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-6 py-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Billed to
          </p>
          <p className="font-medium">{sale.customer?.name ?? "Walk-in customer"}</p>
          {sale.customer?.phone && <p className="text-sm">{sale.customer.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Status
          </p>
          <p className="font-medium">{sale.status}</p>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-neutral-50 text-left">
            <th className="p-2 font-semibold">#</th>
            <th className="p-2 font-semibold">Item</th>
            <th className="p-2 text-right font-semibold">Price</th>
            <th className="p-2 text-right font-semibold">Qty</th>
            <th className="p-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i, n) => (
            <tr key={i.id} className="border-b align-top">
              <td className="p-2">{n + 1}</td>
              <td className="p-2">
                {lineName(i, shop.showSizeColour)}
                {shop.showSku && (
                  <span className="ml-2 text-xs text-neutral-500">{i.variant.sku}</span>
                )}
                {i.isFree && (
                  <span className="ml-2 text-xs font-semibold uppercase">Free</span>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">
                {i.isFree ? "—" : money(i.price)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {qty(i.qty)} {i.variant.product.unit?.shortName ?? ""}
              </td>
              <td className="p-2 text-right tabular-nums">{money(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="p-2 text-sm font-medium" colSpan={3}>
              Total quantity: {qty(totalQty)}
            </td>
            <td className="p-2 text-right text-sm">Subtotal</td>
            <td className="p-2 text-right tabular-nums">{money(sale.subtotal)}</td>
          </tr>
          {num(sale.discount) > 0 && (
            <tr>
              <td colSpan={3} />
              <td className="p-2 text-right text-sm">
                Discount
                {sale.discountType === "PERCENT" && ` (${num(sale.discountValue)}%)`}
              </td>
              <td className="p-2 text-right tabular-nums">−{money(sale.discount)}</td>
            </tr>
          )}
          <tr className="border-t">
            <td colSpan={3} />
            <td className="p-2 text-right font-semibold">Total</td>
            <td className="p-2 text-right text-lg font-bold tabular-nums">
              {money(sale.total)}
            </td>
          </tr>
          <tr>
            <td colSpan={3} />
            <td className="p-2 text-right text-sm">Paid</td>
            <td className="p-2 text-right tabular-nums">{money(sale.paid)}</td>
          </tr>
          {tendered != null && (
            <>
              <tr>
                <td colSpan={3} />
                <td className="p-2 text-right text-sm">Cash received</td>
                <td className="p-2 text-right tabular-nums">{money(tendered)}</td>
              </tr>
              <tr>
                <td colSpan={3} />
                <td className="p-2 text-right text-sm">Change</td>
                <td className="p-2 text-right tabular-nums">{money(change ?? 0)}</td>
              </tr>
            </>
          )}
          {num(sale.due) > 0 && (
            <tr>
              <td colSpan={3} />
              <td className="p-2 text-right font-semibold">Due</td>
              <td className="p-2 text-right font-semibold tabular-nums">
                {money(sale.due)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>

      {/* Digits can be altered with a pen; a sentence cannot. That is what this is for. */}
      {shop.showInWords && (
        <p className="mt-4 border-t pt-4 text-sm">
          <span className="font-semibold">In words:</span> {totalInWords}
        </p>
      )}

      {sale.note && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Remark:</span> {sale.note}
        </p>
      )}

      {shop.showPaymentDetails && sale.payments.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Payment details
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {sale.payments.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-1">{p.date.toLocaleDateString()}</td>
                  <td className="py-1">{methodLabel(p.method)}</td>
                  <td className="py-1 text-right tabular-nums">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(sale.pointsEarned > 0 || sale.pointsRedeemed > 0) && sale.customer && (
        <div className="mt-6 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Points
          </p>
          {sale.pointsRedeemed > 0 && <p>Redeemed: {sale.pointsRedeemed}</p>}
          {sale.pointsEarned > 0 && <p>Earned: {sale.pointsEarned}</p>}
          <p>Available: {sale.customer.loyaltyPoints}</p>
        </div>
      )}

      {shop.showSignatures && (
        <div className="mt-16 flex justify-between gap-8 text-sm">
          <div className="w-48 border-t pt-1 text-center">{shop.signatureLeft}</div>
          <div className="w-48 border-t pt-1 text-center">{shop.signatureRight}</div>
        </div>
      )}

      {/* The shop's own words, or none. MPoS states no returns policy of its own (§27.2). */}
      <p className="mt-8 text-center text-xs text-neutral-500">
        Thank you for shopping with us.
        {shop.footerNote && <span className="block">{shop.footerNote}</span>}
      </p>
    </div>
  );
}
