import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { Pencil, Undo2 } from "lucide-react";
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

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, "purchases.view")) redirect("/dashboard");
  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isFinite(purchaseId)) notFound();

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: true,
      items: { include: { variant: { include: { product: true } } } },
      payments: { include: { account: true } },
      returns: { include: { returnType: true } },
    },
  });
  if (!purchase) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={purchase.purchaseNo}
        description={`${purchase.supplier?.name ?? "—"} · ${shortDate(purchase.date)}`}
      >
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/purchases/${purchase.id}/return`}>
              <Undo2 className="size-4" />
              Return
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/purchases/${purchase.id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Supplier invoice" value={purchase.supplierInvoiceNo ?? "—"} />
        <Fact
          label="Payment due"
          value={purchase.dueDate ? shortDate(purchase.dueDate) : "—"}
        />
        <Fact label="Reference" value={purchase.reference ?? "—"} />
        <Fact label="Status" value={purchase.status} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <span className="font-medium">
                    {i.variant.label
                      ? `${i.variant.product.name} — ${i.variant.label}`
                      : i.variant.product.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {i.variant.sku}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{qty(i.qty)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {num(i.returnedQty) > 0 ? qty(i.returnedQty) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(i.purchasePrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
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
          {purchase.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing paid yet — the full amount is owed.
            </p>
          ) : (
            <ul className="space-y-2">
              {purchase.payments.map((p) => (
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

          {purchase.returns.length > 0 && (
            <>
              <h3 className="mb-3 mt-5 font-medium">Returns</h3>
              <ul className="space-y-2">
                {purchase.returns.map((r) => (
                  <li key={r.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {r.returnNo} · {r.returnType.name} · {shortDate(r.date)}
                    </span>
                    <span className="tabular-nums">{money(r.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-medium">Summary</h3>
          <SumRow label="Subtotal" value={money(purchase.subtotal)} />
          <SumRow
            label={
              purchase.discountType === "PERCENT"
                ? `Discount (${num(purchase.discountValue)}%)`
                : "Discount"
            }
            value={`−${money(purchase.discount)}`}
          />
          <div className="mt-2 border-t pt-2">
            <SumRow label="Total" value={money(purchase.total)} strong />
            <SumRow label="Paid" value={money(purchase.paid)} />
            <SumRow
              label="Due"
              value={money(purchase.due)}
              strong
              className={num(purchase.due) > 0 ? "text-destructive" : "text-primary"}
            />
          </div>
          {purchase.note && (
            <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
              {purchase.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
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
