import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { money, num, shortDate } from "@/lib/format";
import { round2 } from "@/lib/costing";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MONTHS } from "@/lib/months";
import {
  AddEmployeeButton,
  EmployeeRowActions,
  PaySalaryButton,
  UndoSalaryButton,
  MonthPicker,
} from "./employee-dialogs";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await auth();
  // The page gate as well as the action gate (BLUEPRINT §24.4). What the staff are
  // paid is not a cashier's business, and a URL is not a permission.
  if (!hasPermission(session, "employees.manage")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const month = Number(sp.month) >= 1 && Number(sp.month) <= 12 ? Number(sp.month) : now.getMonth() + 1;
  const year = Number(sp.year) >= 2000 ? Number(sp.year) : now.getFullYear();

  const [employees, paidRows, payments, accounts] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ isActive: "desc" }, { id: "asc" }] }),
    // What has been paid FOR this month — whenever it was actually handed over. An
    // advance paid in June for July's wages belongs to July, which is why the month
    // is stamped on the payment rather than read off its date.
    prisma.salaryPayment.groupBy({
      by: ["employeeId"],
      where: { month, year },
      _sum: { amount: true },
    }),
    prisma.salaryPayment.findMany({
      where: { month, year },
      orderBy: { id: "desc" },
      include: {
        employee: { select: { name: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.account.findMany({ orderBy: { id: "asc" } }),
  ]);

  const paidBy = new Map(paidRows.map((r) => [r.employeeId, round2(num(r._sum.amount))]));

  // The month's due is worked out here and stored nowhere (§24.3): salary minus what
  // has been paid for it. A stored due is a second number that can disagree with the
  // payments; a derived one cannot.
  const sheet = employees.map((e) => {
    const salary = round2(num(e.monthlySalary));
    const paid = paidBy.get(e.id) ?? 0;
    return { e, salary, paid, due: e.isActive ? round2(salary - paid) : 0 };
  });

  const totals = sheet.reduce(
    (t, r) => ({
      salary: round2(t.salary + (r.e.isActive ? r.salary : 0)),
      paid: round2(t.paid + r.paid),
      due: round2(t.due + r.due),
    }),
    { salary: 0, paid: 0, due: 0 },
  );

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    balance: num(a.balance),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Money"
        title="Employees"
        description="The staff, and what each is owed for the month you are looking at."
      >
        <div className="flex flex-wrap gap-2">
          <MonthPicker month={month} year={year} />
          <AddEmployeeButton />
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Wage bill — ${MONTHS[month - 1]} ${year}`}
          value={money(totals.salary)}
        />
        <StatCard label="Paid" value={totals.paid.toFixed(2)} tone="good" />
        <StatCard label="Still owed" value={totals.due.toFixed(2)} tone="bad" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Monthly salary</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Nobody on the books yet.
                </TableCell>
              </TableRow>
            )}

            {sheet.map(({ e, salary, paid, due }) => (
              <TableRow key={e.id} className={e.isActive ? undefined : "opacity-60"}>
                <TableCell className="font-medium">
                  {e.name}
                  <span className="block text-xs text-muted-foreground">
                    {e.designation}
                    {!e.isActive && (
                      <Badge variant="outline" className="ml-2">
                        Left
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.phone}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {shortDate(e.joiningDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(salary)}</TableCell>
                <TableCell className="text-right tabular-nums text-primary">
                  {paid ? paid.toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-destructive">
                  {due > 0.005 ? due.toFixed(2) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {e.isActive && (
                      <PaySalaryButton
                        employee={{ id: e.id, name: e.name }}
                        month={month}
                        year={year}
                        due={due}
                        accounts={accountOptions}
                      />
                    )}
                    <EmployeeRowActions
                      employee={{
                        id: e.id,
                        name: e.name,
                        designation: e.designation,
                        phone: e.phone,
                        address: e.address,
                        email: e.email,
                        nid: e.nid,
                        joiningDate: day(e.joiningDate),
                        monthlySalary: num(e.monthlySalary),
                        isActive: e.isActive,
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {sheet.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {totals.salary.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totals.paid.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totals.due.toFixed(2)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {payments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Paid for {MONTHS[month - 1]} {year}
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Handed over</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-16 text-right">Undo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">
                      {shortDate(p.date)}
                    </TableCell>
                    <TableCell className="font-medium">{p.employee.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.account?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(p.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <UndoSalaryButton id={p.id} />
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
