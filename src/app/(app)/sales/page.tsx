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
import { SaleRowActions } from "./sale-row-actions";

const statusStyles: Record<string, string> = {
  PAID: "bg-primary/10 text-primary hover:bg-primary/10",
  PARTIAL: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10",
  DUE: "bg-destructive/10 text-destructive hover:bg-destructive/10",
};

export default async function SalesPage() {
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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title="Sales" description="Everything you've rung up.">
        <Button asChild>
          <Link href="/pos">
            <Plus className="size-4" />
            New Sale
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sales" value={String(sales.length)} />
        <Stat label="Total sold" value={money(totals.total)} />
        <Stat
          label="Outstanding due"
          value={money(totals.due)}
          className={totals.due > 0 ? "text-destructive" : ""}
        />
      </div>

      <div className="rounded-lg border">
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
                  <Badge className={statusStyles[s.status]}>{s.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.soldBy?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <SaleRowActions id={s.id} invoiceNo={s.invoiceNo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  );
}
