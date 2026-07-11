import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { num } from "@/lib/format";
import { ReturnForm } from "./return-form";

export default async function PurchaseReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isFinite(purchaseId)) notFound();

  const [purchase, returnTypes, accounts] = await Promise.all([
    prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        supplier: { select: { name: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    }),
    prisma.returnType.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!purchase) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={`Return against ${purchase.purchaseNo}`}
        description="Send goods back to the supplier. Saving removes them from stock."
      />
      <ReturnForm
        purchaseId={purchase.id}
        purchaseNo={purchase.purchaseNo}
        supplierName={purchase.supplier?.name ?? "—"}
        returnTypes={returnTypes}
        accounts={accounts}
        lines={purchase.items.map((i) => ({
          purchaseItemId: i.id,
          label: i.variant.label
            ? `${i.variant.product.name} — ${i.variant.label}`
            : i.variant.product.name,
          sku: i.variant.sku,
          price: num(i.purchasePrice),
          purchasedQty: num(i.qty),
          returnedQty: num(i.returnedQty),
          inStock: num(i.variant.stockQty),
          qty: 0,
        }))}
      />
    </div>
  );
}
