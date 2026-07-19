import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { money, qty } from "@/lib/format";
import { parseRange } from "@/lib/reports/range";
import { reportAccess } from "@/lib/reports/access";
import { dueTotals, parseBucket, profitLoss, salesSeries } from "@/lib/reports/queries";
import { ReportShell, Stat, reportTabs } from "@/components/reports/report-shell";
import { ChartGranularity } from "@/components/reports/chart-granularity";
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

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const bucket = parseBucket(one(params.bucket), range);

  const [pl, series, dues] = await Promise.all([
    profitLoss(range),
    salesSeries(range, bucket),
    dueTotals(),
  ]);

  const avgSale = pl.invoices === 0 ? 0 : pl.netSales / pl.invoices;
  const peak = Math.max(...series.map((s) => s.total), 0);

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Net sales by {bucket}</h2>
          <div className="no-print flex items-center gap-3">
            <ChartGranularity bucket={bucket} />
            <Link
              href={`/reports/sales?groupBy=${bucket === "month" ? "month" : "day"}`}
              className="text-sm text-primary hover:underline"
            >
              See the breakdown
            </Link>
          </div>
        </div>

        {peak === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sales in this period.
          </p>
        ) : (
          <div className="mt-5 flex h-40 gap-1">
            {series.map((s) => (
              <div
                key={s.key}
                className="group flex flex-1 flex-col"
                title={`${s.title} · ${money(s.total)}`}
              >
                {/* flex-1 gives this column a resolved height, so the bar's
                    percentage height has something real to measure against. */}
                <div className="flex flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{
                      height: `${Math.max((s.total / peak) * 100, s.total > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
                {series.length <= 31 && (
                  <span className="mt-1 text-center text-[10px] text-muted-foreground">
                    {s.label}
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
