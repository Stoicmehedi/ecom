import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { getSettings } from "@/lib/settings";
import { pointsValue } from "@/lib/loyalty";
import { Badge } from "@/components/ui/badge";
import { money, num, shortDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReceiveDueButton } from "./receive-due";

type Entry = {
  date: Date;
  type: string;
  ref: string;
  /** What they owe us goes up (+) or down (−). */
  change: number;
};

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) notFound();

  const [customer, sales, payments, accounts, points, settings] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: customerId },
      include: { customerGroup: true },
    }),
    prisma.sale.findMany({
      where: { customerId },
      orderBy: { date: "asc" },
      select: { id: true, invoiceNo: true, date: true, total: true },
    }),
    prisma.payment.findMany({
      where: { contactId: customerId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        amount: true,
        direction: true,
        method: true,
        saleId: true,
      },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
    prisma.pointEntry.findMany({
      where: { contactId: customerId },
      orderBy: { id: "desc" },
      include: {
        sale: { select: { invoiceNo: true } },
        saleReturn: { select: { returnNo: true } },
      },
    }),
    getSettings(),
  ]);

  if (!customer || customer.type !== "CUSTOMER") notFound();

  const entries: Entry[] = [
    ...sales.map((s) => ({
      date: s.date,
      type: "Sale",
      ref: s.invoiceNo,
      change: num(s.total),
    })),
    // Money in pays down what they owe.
    ...payments.map((p) => ({
      date: p.date,
      type: p.direction === "IN" ? "Payment received" : "Refund paid",
      ref: p.saleId ? "with sale" : (p.method ?? "payment"),
      change: p.direction === "IN" ? -num(p.amount) : num(p.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const opening = num(customer.openingBalance);
  let running = opening;
  const ledger = entries.map((e) => {
    running += e.change;
    return { ...e, balance: running };
  });

  const due = num(customer.dueBalance);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={customer.name}
        description={
          [customer.businessName, customer.phone].filter(Boolean).join(" · ") || "Customer"
        }
      >
        <ReceiveDueButton customerId={customer.id} due={due} accounts={accounts} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Opening due" value={money(opening)} />
        <Stat
          label="Total sold"
          value={money(sales.reduce((s, x) => s + num(x.total), 0))}
        />
        <Stat
          label="Outstanding due"
          value={money(due)}
          className={due > 0 ? "text-destructive" : "text-primary"}
        />
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Group / points</p>
          <p className="mt-1 flex items-center gap-2">
            {customer.customerGroup ? (
              <Badge variant="outline">
                {customer.customerGroup.name} · {num(customer.customerGroup.discount)}%
              </Badge>
            ) : (
              <span className="text-muted-foreground">No group</span>
            )}
            <span className="text-sm tabular-nums text-muted-foreground">
              {customer.loyaltyPoints} pts
            </span>
          </p>
        </div>
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
                <TableCell className="text-muted-foreground">{e.ref}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    e.change > 0 ? "text-destructive" : "text-primary"
                  }`}
                >
                  {e.change > 0 ? "+" : ""}
                  {money(e.change)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
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
                  No transactions with this customer yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* The points ledger (BLUEPRINT §15.6). The balance above is a cache of THIS —
          a balance nobody can explain is a balance nobody can trust. */}
      {points.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Points history</h2>
            <span className="text-sm text-muted-foreground">
              Balance {customer.loyaltyPoints} pts ·{" "}
              {money(pointsValue(customer.loyaltyPoints, settings))}
            </span>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{shortDate(e.date)}</TableCell>
                    <TableCell>{e.note ?? e.type}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.sale?.invoiceNo ?? e.saleReturn?.returnNo ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        e.points >= 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {e.points >= 0 ? "+" : ""}
                      {e.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
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
