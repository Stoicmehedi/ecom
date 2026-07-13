import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { money, num, qty } from "@/lib/format";
import { ReceiptActions } from "./print-button";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOBILE: "Mobile banking",
  CARD: "Card",
  BANK: "Bank transfer",
  CHEQUE: "Cheque",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isFinite(saleId)) notFound();

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: { select: { name: true, phone: true, loyaltyPoints: true } },
      soldBy: { select: { name: true } },
      items: { include: { variant: { include: { product: true } } } },
      payments: true,
      branch: { select: { name: true, address: true, phone: true } },
    },
  });
  if (!sale) notFound();

  const stamp = sale.date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Only the receipt survives printing; the app shell is hidden. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt, .receipt * { visibility: visible !important; }
          .receipt {
            position: absolute; left: 0; top: 0;
            width: 80mm; margin: 0; padding: 4mm;
            border: none !important; box-shadow: none !important;
          }
          .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>

      <ReceiptActions />

      <div className="receipt mx-auto w-[80mm] rounded-lg border bg-white p-4 font-mono text-[11px] leading-tight text-black">
        <div className="text-center">
          <p className="text-base font-bold tracking-wide">MPoS</p>
          <p className="font-semibold">{sale.branch?.name ?? "Main Store"}</p>
          {sale.branch?.address && <p>{sale.branch.address}</p>}
          {sale.branch?.phone && <p>{sale.branch.phone}</p>}
        </div>

        <Divider />

        <div className="flex justify-between">
          <span>Invoice</span>
          <span className="font-semibold">{sale.invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{stamp}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer</span>
          <span>{sale.customer?.name ?? "Walk-in"}</span>
        </div>
        {sale.soldBy && (
          <div className="flex justify-between">
            <span>Served by</span>
            <span>{sale.soldBy.name}</span>
          </div>
        )}

        <Divider />

        <table className="w-full">
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id} className="align-top">
                <td colSpan={2} className="pb-1">
                  <div>
                    {i.variant.label
                      ? `${i.variant.product.name} — ${i.variant.label}`
                      : i.variant.product.name}
                  </div>
                  <div className="flex justify-between">
                    <span>
                      {i.isFree ? (
                        <>
                          {qty(i.qty)} × FREE
                        </>
                      ) : (
                        <>
                          {qty(i.qty)} × {money(i.price)}
                        </>
                      )}
                    </span>
                    <span>{money(i.subtotal)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Divider />

        <Line label="Subtotal" value={money(sale.subtotal)} />
        {num(sale.discount) > 0 && (
          <Line
            label={
              sale.discountType === "PERCENT"
                ? `Discount (${num(sale.discountValue)}%)`
                : "Discount"
            }
            value={`-${money(sale.discount)}`}
          />
        )}

        <div className="my-1 border-t border-dashed border-black" />
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{money(sale.total)}</span>
        </div>
        <div className="my-1 border-t border-dashed border-black" />

        {sale.payments.map((p) => (
          <Line
            key={p.id}
            label={METHOD_LABELS[p.method ?? ""] ?? p.method ?? "Paid"}
            value={money(p.amount)}
          />
        ))}
        {num(sale.due) > 0 && (
          <div className="mt-1 flex justify-between font-bold">
            <span>DUE</span>
            <span>{money(sale.due)}</span>
          </div>
        )}

        <Divider />

        <p className="text-center">
          {sale.items.length} item{sale.items.length === 1 ? "" : "s"}
        </p>
        {sale.note && (
          <p className="mt-1 text-center">Remark: {sale.note}</p>
        )}

        {(sale.pointsEarned > 0 || sale.pointsRedeemed > 0) && sale.customer && (
          <>
            <Divider />
            <p className="font-semibold">Points</p>
            {sale.pointsRedeemed > 0 && (
              <Line label="Redeemed" value={String(sale.pointsRedeemed)} />
            )}
            {sale.pointsEarned > 0 && (
              <Line label="Earned" value={String(sale.pointsEarned)} />
            )}
            <Line label="Balance" value={String(sale.customer.loyaltyPoints)} />
          </>
        )}
        <p className="mt-2 text-center font-semibold">Thank you!</p>
        <p className="text-center">Goods once sold are exchangeable within 7 days.</p>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
