import { prisma } from "@/lib/prisma";
import { num } from "@/lib/format";
import { browsePos } from "./search";
import { PosTerminal } from "./pos-terminal";

export default async function PosPage() {
  const [customers, accounts, products, held] = await Promise.all([
    prisma.contact.findMany({
      where: { type: "CUSTOMER" },
      orderBy: [{ isWalkIn: "desc" }, { name: "asc" }],
      include: { customerGroup: { select: { discount: true } } },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
    browsePos(),
    prisma.heldSale.findMany({ orderBy: { id: "desc" } }),
  ]);

  return (
    <div className="space-y-4">
      <PosTerminal
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          isWalkIn: c.isWalkIn,
          groupDiscount: c.customerGroup ? num(c.customerGroup.discount) : 0,
        }))}
        accounts={accounts}
        initialProducts={products}
        heldSales={held.map((h) => ({
          id: h.id,
          label: h.label,
          customerId: h.customerId,
          count: Array.isArray(h.cart) ? h.cart.length : 0,
        }))}
      />
    </div>
  );
}
