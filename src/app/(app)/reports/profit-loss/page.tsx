import { money } from "@/lib/format";
import { parseRange } from "@/lib/reports/range";
import { reportAccess } from "@/lib/reports/access";
import { profitLoss } from "@/lib/reports/queries";
import { ReportShell, Stat, reportTabs } from "@/components/reports/report-shell";
import { Forbidden } from "@/components/reports/forbidden";
import { cn } from "@/lib/utils";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { canView, canSeeProfit } = await reportAccess();
  if (!canView) return <Forbidden kind="reports" />;
  if (!canSeeProfit) return <Forbidden />;

  const range = parseRange(await searchParams);
  const pl = await profitLoss(range);

  return (
    <ReportShell
      title="Profit & Loss"
      description="What the goods sold for, what they cost us, and what is left."
      active="profit-loss"
      tabs={reportTabs(true)}
      range={range}
      exportKey="profit-loss"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Net sales" value={money(pl.netSales)} />
        <Stat
          label="Gross profit"
          value={money(pl.grossProfit)}
          tone={pl.grossProfit < 0 ? "bad" : "good"}
        />
        <Stat
          label="Margin on net sales"
          value={pl.marginPct == null ? "—" : `${pl.marginPct.toFixed(2)}%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Revenue">
          <Line label="Gross sales" value={pl.grossSales} />
          <Line label="Discount given" value={-pl.discount} muted />
          <Line label="Sale returns" value={-pl.saleReturns} muted />
          <Line label="Net sales" value={pl.netSales} strong />
        </Block>

        <Block title="Cost of goods">
          <Line label="Cost of goods sold" value={pl.cogs} />
          <Line label="Cost of goods returned" value={-pl.returnedCost} muted />
          <Line label="Net cost of goods" value={pl.netCogs} strong />
        </Block>
      </div>

      <div className="report-surface rounded-lg border border-primary/40 bg-primary/5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-medium">Gross profit</h2>
            <p className="text-sm text-muted-foreground">
              Net sales {money(pl.netSales)} − net cost of goods {money(pl.netCogs)}
            </p>
          </div>
          <p
            className={cn(
              "text-3xl font-semibold tabular-nums",
              pl.grossProfit < 0 ? "text-destructive" : "text-primary",
            )}
          >
            {money(pl.grossProfit)}
          </p>
        </div>
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
          Expenses and salaries are not tracked yet, so gross profit is also the net
          profit for this period. Once expenses ship, this figure grows a second line.
        </p>
      </div>

      <Block title="Cash movement — context, not profit">
        <p className="pb-2 text-sm text-muted-foreground">
          Buying stock converts cash into inventory; it costs nothing until the goods
          sell. These figures are here to explain the till, not the profit above.
        </p>
        <Line label="Purchases" value={pl.purchases} muted />
        <Line label="Purchase returns" value={pl.purchaseReturns} muted />
        <Line label="Cash in (all receipts)" value={pl.cashIn} />
        <Line label="Cash out (all payments)" value={-pl.cashOut} />
        <Line label="Net cash movement" value={pl.cashIn - pl.cashOut} strong />
      </Block>
    </ReportShell>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="report-surface rounded-lg border p-5">
      <h2 className="mb-3 font-medium">{title}</h2>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 text-sm",
        strong && "mt-1 border-t pt-2.5 text-base font-semibold",
      )}
    >
      <dt className={cn(muted && !strong && "text-muted-foreground")}>{label}</dt>
      <dd className={cn("tabular-nums", muted && !strong && "text-muted-foreground")}>
        {value < 0 ? `(${money(Math.abs(value))})` : money(value)}
      </dd>
    </div>
  );
}
