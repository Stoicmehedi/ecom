import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { money, num, shortDate } from "@/lib/format";
import { round2 } from "@/lib/costing";
import { buildStatement } from "@/lib/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CashMoveRowAction } from "../account-dialogs";

export default async function AccountStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, "accounts.manage")) redirect("/dashboard");

  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isInteger(accountId)) notFound();

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) notFound();

  const payments = await prisma.payment.findMany({
    where: { accountId },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: {
      sale: { select: { invoiceNo: true } },
      purchase: { select: { purchaseNo: true } },
      saleReturn: { select: { returnNo: true } },
      purchaseReturn: { select: { returnNo: true } },
      expense: { select: { expenseType: { select: { name: true } } } },
      contact: { select: { name: true } },
    },
  });

  const opening = num(account.openingBalance);
  const rows = buildStatement(opening, payments);

  const totalIn = round2(rows.reduce((s, r) => s + r.in, 0));
  const totalOut = round2(rows.reduce((s, r) => s + r.out, 0));

  // The last row's running balance IS what the account holds — if it is not, one of
  // the two numbers is wrong, and the shopkeeper should be told rather than shown a
  // tidy figure that hides it (§23.3).
  const computed = rows.length ? rows[rows.length - 1].balance : opening;
  const stored = num(account.balance);
  const drift = round2(computed - stored);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Money"
        title={account.name}
        description="Every movement through this account, oldest first, with the running balance."
      >
        <Button variant="outline" asChild>
          <Link href="/accounts">All accounts</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Opening balance" value={money(opening)} />
        <StatCard label="Money in" value={totalIn.toFixed(2)} tone="good" />
        <StatCard label="Money out" value={totalOut.toFixed(2)} tone="bad" />
        <StatCard label="Balance now" value={money(stored)} />
      </div>

      {Math.abs(drift) > 0.005 && (
        <p className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          The movements below add up to {computed.toFixed(2)}, but the account says{" "}
          {stored.toFixed(2)} — a difference of {drift.toFixed(2)}. One of the two is
          wrong; do not trust either until it is found.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/30">
              <TableCell className="text-muted-foreground">
                {shortDate(account.createdAt)}
              </TableCell>
              <TableCell colSpan={5} className="font-medium">
                Opening balance
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {opening.toFixed(2)}
              </TableCell>
              <TableCell />
            </TableRow>

            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nothing has moved through this account yet.
                </TableCell>
              </TableRow>
            )}

            {rows.map((r, i) => (
              <TableRow key={payments[i].id}>
                <TableCell className="text-muted-foreground">
                  {shortDate(new Date(r.date))}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.type}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {r.href ? (
                    <Link href={r.href} className="hover:text-primary">
                      {r.ref}
                    </Link>
                  ) : (
                    r.ref
                  )}
                </TableCell>
                <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                  {r.note}
                </TableCell>
                <TableCell className="text-right tabular-nums text-primary">
                  {r.in ? r.in.toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  {r.out ? r.out.toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {r.balance.toFixed(2)}
                </TableCell>
                <TableCell>
                  {/* Only a bare deposit or withdrawal can be undone from here.
                      Anything attached to a document is owned by that document. */}
                  {(r.type === "Deposit" || r.type === "Withdrawal") && (
                    <CashMoveRowAction id={payments[i].id} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
