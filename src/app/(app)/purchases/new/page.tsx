import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { PurchaseForm } from "../purchase-form";

export default async function NewPurchasePage() {
  const [suppliers, accounts] = await Promise.all([
    prisma.contact.findMany({
      where: { type: "SUPPLIER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="New Purchase"
        description="Receive stock from a supplier. Saving adds the quantities to inventory."
      />
      <PurchaseForm
        suppliers={suppliers}
        accounts={accounts}
        initial={{
          date: today,
          discountType: "AMOUNT",
          discountValue: 0,
          items: [],
          payments: [],
        }}
      />
    </div>
  );
}
