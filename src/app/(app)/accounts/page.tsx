import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { money, num, shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AddAccountButton,
  AccountRowActions,
  CashMoveButton,
  TransferButton,
  TransferRowActions,
} from "./account-dialogs";

const TYPE_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank",
  MOBILE: "Mobile",
};

export default async function AccountsPage() {
  const session = await auth();
  // The page gate, not just the action gate (BLUEPRINT §23.3). Hand-moving money is
  // the easiest place in the app to hide theft, so a cashier must not even reach it
  // by typing the URL.
  if (!hasPermission(session, "accounts.manage")) redirect("/dashboard");

  const [accounts, transfers] = await Promise.all([
    prisma.account.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { payments: true } } },
    }),
    prisma.accountTransfer.findMany({
      orderBy: { id: "desc" },
      take: 20,
      include: {
        fromAccount: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
    }),
  ]);

  const total = accounts.reduce((s, a) => s + num(a.balance), 0);
  const options = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Money"
        title="Accounts"
        description="The shop's own money — what is in the till, and what has moved."
      >
        <div className="flex gap-2">
          <CashMoveButton direction="IN" accounts={options} />
          <CashMoveButton direction="OUT" accounts={options} />
          <TransferButton accounts={options} />
          <AddAccountButton />
        </div>
      </PageHeader>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <Link href={`/accounts/${a.id}`} className="hover:text-primary">
                    {a.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {a._count.payments} entries
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{TYPE_LABEL[a.type] ?? a.type}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.bankName || a.accountNumber
                    ? [a.bankName, a.accountNumber].filter(Boolean).join(" · ")
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {money(a.openingBalance)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {money(a.balance)}
                </TableCell>
                <TableCell>
                  <AccountRowActions
                    account={{
                      id: a.id,
                      name: a.name,
                      type: a.type,
                      bankName: a.bankName,
                      accountNumber: a.accountNumber,
                      openingBalance: num(a.openingBalance),
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={4}>Total the shop holds</TableCell>
              <TableCell className="text-right tabular-nums">{total.toFixed(2)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {transfers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recent transfers</h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Moved</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-16 text-right">Undo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">
                      {shortDate(t.date)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {t.fromAccount.name}
                        <ArrowRight className="size-3 text-muted-foreground" />
                        {t.toAccount.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(t.amount)}
                    </TableCell>
                    <TableCell>
                      <TransferRowActions id={t.id} />
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
