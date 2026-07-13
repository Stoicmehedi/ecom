import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Undo2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { money, num, qty, shortDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOBILE: "Mobile banking",
  CARD: "Card",
  BANK: "Bank transfer",
  CHEQUE: "Cheque",
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isFinite(saleId)) notFound();

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      soldBy: { select: { name: true } },
      items: { include: { variant: { include: { product: true } } } },
      payments: { include: { account: true } },
    },
  });
  if (!sale) notFound();

  // Profit is measurable because each line kept the cost it carried at sale time.
  const cost = sale.items.reduce((s, i) => s + num(i.qty) * num(i.costAtSale), 0);
  const revenue = sale.items.reduce((s, i) => s + num(i.subtotal), 0);
  const profit = revenue - num(sale.discount) - cost;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={sale.invoiceNo}
        description={`${sale.customer?.name ?? "Walk-in"} · ${shortDate(sale.date)}${
          sale.soldBy ? ` · sold by ${sale.soldBy.name}` : ""
        }`}
      >
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/sales/${sale.id}/return`}>
              <Undo2 className="size-4" />
              Return
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/sales/${sale.id}/receipt`}>
              <Printer className="size-4" />
              Receipt
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        <Fact label="Status" value={sale.status} />
        <Fact label="Cost of goods" value={money(cost)} />
        <Fact
          label="Profit"
          value={money(profit)}
          className={profit >= 0 ? "text-primary" : "text-destructive"}
        />
        <Fact
          label="Due date"
          value={sale.dueDate ? shortDate(sale.dueDate) : "—"}
        />
      </div>

      {sale.note && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Remark: </span>
          <span className="font-medium">{sale.note}</span>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Cost at sale</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <span className="font-medium">
                    {i.variant.label
                      ? `${i.variant.product.name} — ${i.variant.label}`
                      : i.variant.product.name}
                  </span>
                  {i.isFree && (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Free issue
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {i.variant.sku}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{qty(i.qty)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(i.price)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {money(i.costAtSale)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(i.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-medium">Payments</h3>
          {sale.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing paid — the full amount is owed.
            </p>
          ) : (
            <ul className="space-y-2">
              {sale.payments.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {METHOD_LABELS[p.method ?? ""] ?? p.method}
                    {p.account && ` · ${p.account.name}`}
                  </span>
                  <span className="tabular-nums">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-medium">Summary</h3>
          <SumRow label="Subtotal" value={money(sale.subtotal)} />
          <SumRow
            label={
              sale.discountType === "PERCENT"
                ? `Discount (${num(sale.discountValue)}%)`
                : "Discount"
            }
            value={`−${money(sale.discount)}`}
          />
          <div className="mt-2 border-t pt-2">
            <SumRow label="Total" value={money(sale.total)} strong />
            <SumRow label="Paid" value={money(sale.paid)} />
            <SumRow
              label="Due"
              value={money(sale.due)}
              strong
              className={num(sale.due) > 0 ? "text-destructive" : "text-primary"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-medium tabular-nums ${className}`}>{value}</p>
    </div>
  );
}

function SumRow({
  label,
  value,
  strong,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${className}`}
      >
        {value}
      </span>
    </div>
  );
}
