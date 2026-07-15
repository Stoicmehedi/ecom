import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
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
import { SaleRowActions } from "./sale-row-actions";

export default async function SalesPage() {
  const session = await auth();
  if (!hasPermission(session, "sales.view")) redirect("/dashboard");
  const canReturn = hasPermission(session, "sales.return");
  const canDelete = hasPermission(session, "sales.delete");
  const sales = await prisma.sale.findMany({
    orderBy: { id: "desc" },
    include: {
      customer: { select: { name: true } },
      soldBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  const totals = sales.reduce(
    (a, s) => ({
      total: a.total + num(s.total),
      due: a.due + num(s.due),
    }),
    { total: 0, due: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader eyebrow="Selling" title="Sales" description="Everything you've rung up.">
        <Button asChild>
          <Link href="/pos">
            <Plus className="size-4" />
            New Sale
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sales" value={String(sales.length)} />
        <StatCard label="Total sold" value={money(totals.total)} />
        <StatCard
          label="Outstanding due"
          value={money(totals.due)}
          tone={totals.due > 0 ? "bad" : "default"}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead>Sold by</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No sales yet.{" "}
                  <Link href="/pos" className="text-primary underline">
                    Open the POS
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}
            {sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/sales/${s.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {s.invoiceNo}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {shortDate(s.date)}
                </TableCell>
                <TableCell>{s.customer?.name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s._count.items}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(s.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(s.paid)}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    num(s.due) > 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {money(s.due)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.soldBy?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <SaleRowActions
                    id={s.id}
                    invoiceNo={s.invoiceNo}
                    canReturn={canReturn}
                    canDelete={canDelete}
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
