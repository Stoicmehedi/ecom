import Link from "next/link";
import { money, num } from "@/lib/format";
import { reportAccess } from "@/lib/reports/access";
import { duesReport, type DueSide } from "@/lib/reports/queries";
import { ReportShell, Stat, reportTabs } from "@/components/reports/report-shell";
import { ReportTableView } from "@/components/reports/report-table";
import { Forbidden } from "@/components/reports/forbidden";
import { cn } from "@/lib/utils";

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { canView, canSeeProfit } = await reportAccess();
  if (!canView) return <Forbidden kind="reports" />;

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const side: DueSide = one(params.side) === "payable" ? "payable" : "receivable";

  const table = await duesReport(side);

  const total = num(table.totals?.due);
  // Anything past this is worth chasing, not just noting.
  const OLD = 30;
  const old = table.rows
    .filter((r) => Number(r.age) >= OLD)
    .reduce((a, r) => a + Number(r.due ?? 0), 0);

  return (
    <ReportShell
      title="Dues"
      description="Who owes us, who we owe, and how long it has been."
      active="dues"
      tabs={reportTabs(canSeeProfit)}
      exportKey="dues"
      toolbar={<SideTabs side={side} />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={side === "receivable" ? "Customers owe us" : "We owe suppliers"}
          value={money(total)}
          tone={total > 0 ? "bad" : "muted"}
        />
        <Stat
          label={`Older than ${OLD} days`}
          value={money(old)}
          tone={old > 0 ? "bad" : "muted"}
          hint={old > 0 ? "worth chasing" : "nothing overdue"}
        />
        <Stat
          label="Open documents"
          value={String(table.rows.length)}
          hint={side === "receivable" ? "unpaid invoices" : "unpaid purchases"}
        />
      </div>

      <ReportTableView
        table={table}
        empty={
          side === "receivable"
            ? "Nobody owes you anything."
            : "You don't owe any supplier anything."
        }
      />
    </ReportShell>
  );
}

/** Two sides of the same question — a filter, not two reports. */
function SideTabs({ side }: { side: DueSide }) {
  const item = (value: DueSide, label: string) => (
    <Link
      href={`/reports/dues?side=${value}`}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        side === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="no-print flex gap-1 rounded-lg border p-1">
      {item("receivable", "Receivable")}
      {item("payable", "Payable")}
    </div>
  );
}
