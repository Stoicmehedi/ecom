import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { num } from "@/lib/format";
import { PurchaseForm } from "../../purchase-form";

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isFinite(purchaseId)) notFound();

  const [purchase, suppliers, accounts] = await Promise.all([
    prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        items: {
          include: {
            variant: { include: { product: { include: { unit: true } } } },
          },
        },
        payments: true,
      },
    }),
    prisma.contact.findMany({
      where: { type: "SUPPLIER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!purchase) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={`Edit ${purchase.purchaseNo}`}
        description="Changing this purchase re-applies its effect on stock and cost."
      />
      <PurchaseForm
        suppliers={suppliers}
        accounts={accounts}
        initial={{
          id: purchase.id,
          supplierId: purchase.supplierId ?? undefined,
          date: purchase.date.toISOString().slice(0, 10),
          dueDate: purchase.dueDate?.toISOString().slice(0, 10),
          supplierInvoiceNo: purchase.supplierInvoiceNo ?? undefined,
          reference: purchase.reference ?? undefined,
          note: purchase.note ?? undefined,
          discountType: purchase.discountType,
          discountValue: num(purchase.discountValue),
          items: purchase.items.map((i) => ({
            variantId: i.variantId,
            label: i.variant.label
              ? `${i.variant.product.name} — ${i.variant.label}`
              : i.variant.product.name,
            sku: i.variant.sku,
            allowDecimal: i.variant.product.unit?.allowDecimal ?? false,
            qty: num(i.qty),
            purchasePrice: num(i.purchasePrice),
          })),
          payments: purchase.payments.map((p) => ({
            method: p.method ?? "CASH",
            accountId: p.accountId,
            amount: num(p.amount),
          })),
        }}
      />
    </div>
  );
}
