import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
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

const statusStyles: Record<string, string> = {
  PAID: "bg-primary/10 text-primary hover:bg-primary/10",
  PARTIAL: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10",
  DUE: "bg-destructive/10 text-destructive hover:bg-destructive/10",
};

export default async function PurchasesPage() {
  const purchases = await prisma.purchase.findMany({
    orderBy: { id: "desc" },
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true, returns: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Purchases"
        description="Stock received from suppliers."
      >
        <Button asChild>
          <Link href="/purchases/new">
            <Plus className="size-4" />
            New Purchase
          </Link>
        </Button>
      </PageHeader>

      <div className="rounded-lg border">
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
                  <Badge className={statusStyles[p.status]}>{p.status}</Badge>
                  {p._count.returns > 0 && (
                    <Badge variant="outline" className="ml-1">
                      Returned
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <PurchaseRowActions id={p.id} purchaseNo={p.purchaseNo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
