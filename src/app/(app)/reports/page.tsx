import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { money, qty } from "@/lib/format";
import { parseRange } from "@/lib/reports/range";
import { reportAccess } from "@/lib/reports/access";
import { dueTotals, profitLoss, salesByDay } from "@/lib/reports/queries";
import { ReportShell, Stat, reportTabs } from "@/components/reports/report-shell";
import { Forbidden } from "@/components/reports/forbidden";

export default async function ReportsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!hasPermission(session, "reports.view")) redirect("/dashboard");
  const { canView, canSeeProfit } = await reportAccess();
  if (!canView) return <Forbidden kind="reports" />;

  const params = await searchParams;
  const range = parseRange(params);

  const [pl, days, dues] = await Promise.all([
    profitLoss(range),
    salesByDay(range),
    dueTotals(),
  ]);

  const avgSale = pl.invoices === 0 ? 0 : pl.netSales / pl.invoices;
  const peak = Math.max(...days.map((d) => d.total), 0);

  return (
    <ReportShell
      title="Reports"
      description="How the shop is doing, over any stretch of time."
      active="overview"
      tabs={reportTabs(canSeeProfit)}
      range={range}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Net sales"
          value={money(pl.netSales)}
          hint={
            pl.saleReturns > 0
              ? `after ${money(pl.saleReturns)} returned`
              : undefined
          }
        />
        {canSeeProfit ? (
          <>
            <Stat
              label="Gross profit"
              value={money(pl.grossProfit)}
              tone={pl.grossProfit < 0 ? "bad" : "good"}
              hint="net sales − cost of goods"
            />
            <Stat
              label="Margin"
              value={pl.marginPct == null ? "—" : `${pl.marginPct.toFixed(2)}%`}
              hint="share of net sales kept"
            />
          </>
        ) : (
          <>
            <Stat label="Invoices" value={String(pl.invoices)} />
            <Stat label="Items sold" value={qty(pl.itemsSold)} />
          </>
        )}
        <Stat
          label="Average sale"
          value={money(avgSale)}
          hint={`${pl.invoices} invoice${pl.invoices === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash in" value={money(pl.cashIn)} hint="all money received" />
        <Stat label="Cash out" value={money(pl.cashOut)} hint="all money paid out" />
        <Stat
          label="Customers owe us"
          value={money(dues.receivable)}
          tone={dues.receivable > 0 ? "bad" : "muted"}
          hint="outstanding right now"
        />
        <Stat
          label="We owe suppliers"
          value={money(dues.payable)}
          tone={dues.payable > 0 ? "bad" : "muted"}
          hint="outstanding right now"
        />
      </div>

      <div className="report-surface rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Net sales by day</h2>
          <Link
            href="/reports/sales?groupBy=day"
            className="no-print text-sm text-primary hover:underline"
          >
            See the breakdown
          </Link>
        </div>

        {peak === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sales in this period.
          </p>
        ) : (
          <div className="mt-5 flex h-40 gap-1">
            {days.map((d) => (
              <div
                key={d.day}
                className="group flex flex-1 flex-col"
                title={`${d.day} · ${money(d.total)}`}
              >
                {/* flex-1 gives this column a resolved height, so the bar's
                    percentage height has something real to measure against. */}
                <div className="flex flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{
                      height: `${Math.max((d.total / peak) * 100, d.total > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
                {days.length <= 31 && (
                  <span className="mt-1 text-center text-[10px] text-muted-foreground">
                    {d.day.slice(8)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!canSeeProfit && (
        <p className="text-xs text-muted-foreground">
          Cost and profit figures are visible to administrators only.
        </p>
      )}
    </ReportShell>
  );
}
