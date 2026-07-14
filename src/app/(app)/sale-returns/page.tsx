import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { money, num, shortDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SaleReturnRowActions } from "./return-row-actions";

export default async function SaleReturnsPage() {
  const session = await auth();
  if (!hasPermission(session, "sales.view")) redirect("/dashboard");
  const returns = await prisma.saleReturn.findMany({
    orderBy: { id: "desc" },
    include: {
      customer: { select: { name: true } },
      sale: { select: { id: true, invoiceNo: true } },
      _count: { select: { items: true } },
    },
  });

  const totals = returns.reduce(
    (a, r) => ({
      value: a.value + num(r.total),
      refunded: a.refunded + num(r.refunded),
    }),
    { value: 0, refunded: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Sale Returns"
        description="Goods customers brought back."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Returns" value={String(returns.length)} />
        <Stat label="Value returned" value={money(totals.value)} />
        <Stat label="Refunded in cash" value={money(totals.refunded)} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return no.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Against</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No sale returns yet.
                </TableCell>
              </TableRow>
            )}
            {returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.returnNo}</TableCell>
                <TableCell className="text-muted-foreground">
                  {shortDate(r.date)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/sales/${r.sale.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {r.sale.invoiceNo}
                  </Link>
                </TableCell>
                <TableCell>{r.customer?.name ?? "Walk-in"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r._count.items}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(r.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {money(r.refunded)}
                </TableCell>
                <TableCell>
                  <SaleReturnRowActions id={r.id} returnNo={r.returnNo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
