import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { num, shortDate } from "@/lib/format";
import { paidRatio, round2 } from "@/lib/costing";
import { getSettings } from "@/lib/settings";
import { SaleReturnForm } from "./return-form";

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isFinite(saleId)) notFound();

  const [sale, accounts, settings] = await Promise.all([
    prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: { select: { name: true, isWalkIn: true } },
        items: {
          include: {
            variant: { include: { product: { include: { unit: true } } } },
          },
        },
      },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);

  if (!sale) notFound();

  const isWalkIn = !sale.customerId || (sale.customer?.isWalkIn ?? false);

  // Price the lines at what the customer actually paid, after the bill's
  // discount is shared out — the same figure the server will credit.
  const ratio = paidRatio(num(sale.subtotal), num(sale.discount));
  const discounted = ratio < 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={`Return against ${sale.invoiceNo}`}
        description="Take goods back from a customer. Saving puts them back into stock."
      />
      {discounted && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          This sale was discounted, so each item is credited at what the customer
          actually paid for it — not at its list price.
        </p>
      )}
      <SaleReturnForm
        saleId={sale.id}
        invoiceNo={sale.invoiceNo}
        customerName={sale.customer?.name ?? "Walk-in"}
        isWalkIn={isWalkIn}
        saleDate={shortDate(sale.date)}
        saleTotal={num(sale.total)}
        pointsRedeemed={sale.pointsRedeemed}
        settings={settings}
        accounts={accounts}
        lines={sale.items.map((i) => ({
          saleItemId: i.id,
          label: i.variant.label
            ? `${i.variant.product.name} — ${i.variant.label}`
            : i.variant.product.name,
          sku: i.variant.sku,
          price: round2(num(i.price) * ratio),
          soldQty: num(i.qty),
          returnedQty: num(i.returnedQty),
          qty: 0,
          allowDecimal: i.variant.product.unit?.allowDecimal ?? false,
        }))}
      />
    </div>
  );
}
