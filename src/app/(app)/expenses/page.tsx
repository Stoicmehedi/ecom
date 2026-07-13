import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { money, num, shortDate } from "@/lib/format";
import { parseRange } from "@/lib/reports/range";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddExpenseButton, ExpenseRowActions, ExpenseTypesButton } from "./expense-dialog";
import { ExpenseFilters } from "./expense-filters";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  // The page gate, not just the action gate: a report a role cannot see must not
  // be readable by typing its URL (the hole the reports review found — §11).
  if (!hasPermission(session, "expenses.manage")) redirect("/dashboard");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  // Default to this month. Every other report defaults to today, but the shop books
  // expenses at month-end (§18.1) — a "today" default would show an empty screen on
  // 30 days out of 31 and read as "you have no expenses".
  const hasRange = one("from") || one("to") || one("preset");
  const range = parseRange(hasRange ? sp : { ...sp, preset: "month" });

  const typeRaw = Number(one("type"));
  const typeId = Number.isInteger(typeRaw) && typeRaw > 0 ? typeRaw : undefined;

  const [expenses, types, accounts] = await Promise.all([
    prisma.expense.findMany({
      where: {
        date: { gte: range.from, lte: range.to },
        ...(typeId ? { expenseTypeId: typeId } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: {
        expenseType: { select: { id: true, name: true, isSystem: true } },
        account: { select: { id: true, name: true } },
        createdBy: { select: { name: true, username: true } },
      },
    }),
    prisma.expenseType.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isSystem: true,
        _count: { select: { expenses: true } },
      },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);

  const total = expenses.reduce((s, e) => s + num(e.amount), 0);

  // What each type cost over the period — the same breakdown the P&L shows, so the
  // two can be read against each other.
  const byType = new Map<string, number>();
  for (const e of expenses) {
    byType.set(e.expenseType.name, (byType.get(e.expenseType.name) ?? 0) + num(e.amount));
  }
  const breakdown = [...byType.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Expenses"
        description="What the shop spends. Gross profit only becomes real profit once this comes off it."
      >
        <div className="flex gap-2">
          <ExpenseTypesButton types={types} />
          <AddExpenseButton
            types={types.filter((t) => !t.isSystem)}
            accounts={accounts}
          />
        </div>
      </PageHeader>

      <ExpenseFilters range={range} types={types} selectedType={typeId} />

      <div className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Paid from</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No expenses in this period.
                  </TableCell>
                </TableRow>
              )}

              {expenses.map((e) => {
                const auto = e.saleId !== null;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{shortDate(e.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {e.expenseType.name}
                        {auto && (
                          <Badge variant="secondary" title="Posted by a sale, not by hand">
                            Auto
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {/* No account means no cash moved — the loyalty cost (§18.8). */}
                      {e.account?.name ?? "— no cash moved"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {e.note ?? ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(e.amount)}
                    </TableCell>
                    <TableCell>
                      {!auto && (
                        <ExpenseRowActions
                          expense={{
                            id: e.id,
                            date: e.date.toISOString().slice(0, 10),
                            expenseTypeId: e.expenseTypeId,
                            accountId: e.accountId,
                            amount: num(e.amount),
                            note: e.note,
                          }}
                          types={types.filter((t) => !t.isSystem)}
                          accounts={accounts}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total — {range.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{money(total)}</p>
          </div>

          {breakdown.length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">By type</p>
              <ul className="space-y-2 text-sm">
                {breakdown.map(([name, amount]) => (
                  <li key={name} className="flex justify-between gap-3">
                    <span className="truncate text-muted-foreground">{name}</span>
                    <span className="tabular-nums">{money(amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
