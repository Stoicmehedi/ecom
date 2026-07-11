import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { num, shortDate } from "@/lib/format";
import { SaleReturnForm } from "./return-form";

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isFinite(saleId)) notFound();

  const [sale, accounts] = await Promise.all([
    prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: { select: { name: true, isWalkIn: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!sale) notFound();

  const isWalkIn = !sale.customerId || (sale.customer?.isWalkIn ?? false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={`Return against ${sale.invoiceNo}`}
        description="Take goods back from a customer. Saving puts them back into stock."
      />
      <SaleReturnForm
        saleId={sale.id}
        invoiceNo={sale.invoiceNo}
        customerName={sale.customer?.name ?? "Walk-in"}
        isWalkIn={isWalkIn}
        saleDate={shortDate(sale.date)}
        accounts={accounts}
        lines={sale.items.map((i) => ({
          saleItemId: i.id,
          label: i.variant.label
            ? `${i.variant.product.name} — ${i.variant.label}`
            : i.variant.product.name,
          sku: i.variant.sku,
          price: num(i.price),
          soldQty: num(i.qty),
          returnedQty: num(i.returnedQty),
          qty: 0,
        }))}
      />
    </div>
  );
}
