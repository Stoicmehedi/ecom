import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { num } from "@/lib/format";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getSellableCategoryTree } from "@/lib/categories";
import { browsePos } from "./search";
import { PosTerminal } from "./pos-terminal";

export default async function PosPage() {
  const session = await auth();
  if (!hasPermission(session, "pos.access")) redirect("/dashboard");
  // Only an Admin may give goods away (BLUEPRINT §16.2). Hiding the control is a
  // courtesy; the server refuses a free line regardless of what the browser sends.
  const canFreeIssue = hasPermission(session, "sales.free_issue");
  const settings = await getSettings();

  const [customers, accounts, products, held, categories, brands] = await Promise.all([
    prisma.contact.findMany({
      where: { type: "CUSTOMER" },
      orderBy: [{ isWalkIn: "desc" }, { name: "asc" }],
      include: { customerGroup: { select: { discount: true } } },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
    browsePos(),
    prisma.heldSale.findMany({ orderBy: { id: "desc" } }),
    getSellableCategoryTree(),
    // Only brands with something to sell — a filter that can only ever return an
    // empty grid is a dead end the cashier has to discover by clicking it.
    prisma.brand.findMany({
      where: { products: { some: { isActive: true } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <PosTerminal
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          isWalkIn: c.isWalkIn,
          groupDiscount: c.customerGroup ? num(c.customerGroup.discount) : 0,
          points: c.loyaltyPoints,
        }))}
        accounts={accounts}
        canFreeIssue={canFreeIssue}
        settings={settings}
        initialProducts={products}
        categories={categories.map((c) => ({ id: c.id, path: c.path }))}
        brands={brands}
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
