import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { money, num, shortDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PurchaseRowActions } from "./purchase-row-actions";

export default async function PurchasesPage() {
  const session = await auth();
  if (!hasPermission(session, "purchases.view")) redirect("/dashboard");
  const canManage = hasPermission(session, "purchases.manage");
  const canReturn = hasPermission(session, "purchases.return");
  const purchases = await prisma.purchase.findMany({
    orderBy: { id: "desc" },
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true, returns: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Buying"
        title="Purchases"
        description="Stock received from suppliers."
      >
        {canManage && (
          <Button asChild>
            <Link href="/purchases/new">
              <Plus className="size-4" />
              New Purchase
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Purchase no.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-36 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No purchases yet.{" "}
                  <Link href="/purchases/new" className="text-primary underline">
                    Record your first one
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}
            {purchases.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/purchases/${p.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {p.purchaseNo}
                  </Link>
                  {p.supplierInvoiceNo && (
                    <span className="block text-xs text-muted-foreground">
                      inv. {p.supplierInvoiceNo}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {shortDate(p.date)}
                </TableCell>
                <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p._count.items}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(p.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(p.paid)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    num(p.due) > 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {money(p.due)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                  {p._count.returns > 0 && (
                    <Badge variant="outline" className="ml-1">
                      Returned
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <PurchaseRowActions
                    id={p.id}
                    purchaseNo={p.purchaseNo}
                    canManage={canManage}
                    canReturn={canReturn}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
