import Link from "next/link";
import { notFound } from "next/navigation";
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
import { PayDueButton } from "./pay-due";

type Entry = {
  date: Date;
  type: string;
  ref: string;
  href?: string;
  /** What we owe them goes up (+) or down (−). */
  change: number;
};

export default async function SupplierLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isFinite(supplierId)) notFound();

  const [supplier, purchases, returns, payments, accounts] = await Promise.all([
    prisma.contact.findUnique({ where: { id: supplierId } }),
    prisma.purchase.findMany({
      where: { supplierId },
      orderBy: { date: "asc" },
      select: { id: true, purchaseNo: true, date: true, total: true },
    }),
    prisma.purchaseReturn.findMany({
      where: { supplierId },
      orderBy: { date: "asc" },
      select: { id: true, returnNo: true, date: true, total: true },
    }),
    prisma.payment.findMany({
      where: { contactId: supplierId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        amount: true,
        direction: true,
        method: true,
        purchaseId: true,
        purchaseReturnId: true,
      },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!supplier || supplier.type !== "SUPPLIER") notFound();

  const entries: Entry[] = [
    ...purchases.map((p) => ({
      date: p.date,
      type: "Purchase",
      ref: p.purchaseNo,
      href: `/purchases/${p.id}`,
      change: num(p.total),
    })),
    ...returns.map((r) => ({
      date: r.date,
      type: "Return",
      ref: r.returnNo,
      change: -num(r.total),
    })),
    // Money out pays down the payable; money in (a refund) puts it back.
    ...payments.map((p) => ({
      date: p.date,
      type: p.direction === "OUT" ? "Payment" : "Refund received",
      ref: p.purchaseReturnId
        ? "refund"
        : p.purchaseId
          ? "with purchase"
          : (p.method ?? "payment"),
      change: p.direction === "OUT" ? -num(p.amount) : num(p.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const opening = num(supplier.openingBalance);
  let running = opening;
  const ledger = entries.map((e) => {
    running += e.change;
    return { ...e, balance: running };
  });

  const due = num(supplier.dueBalance);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={supplier.name}
        description={
          [supplier.businessName, supplier.phone].filter(Boolean).join(" · ") ||
          "Supplier"
        }
      >
        <PayDueButton supplierId={supplier.id} due={due} accounts={accounts} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Opening due" value={money(opening)} />
        <Stat
          label="Total purchased"
          value={money(purchases.reduce((s, p) => s + num(p.total), 0))}
        />
        <Stat
          label="Outstanding due"
          value={money(due)}
          className={due > 0 ? "text-destructive" : "text-primary"}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                Opening balance
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(opening)}</TableCell>
            </TableRow>
            {ledger.map((e, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">
                  {shortDate(e.date)}
                </TableCell>
                <TableCell>{e.type}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.href ? (
                    <Link href={e.href} className="hover:text-primary hover:underline">
                      {e.ref}
                    </Link>
                  ) : (
                    e.ref
                  )}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    e.change > 0 ? "text-destructive" : "text-primary"
                  }`}
                >
                  {e.change > 0 ? "+" : ""}
                  {money(e.change)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {money(e.balance)}
                </TableCell>
              </TableRow>
            ))}
            {ledger.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No transactions with this supplier yet.
                </TableCell>
              </TableRow>
            )}
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
