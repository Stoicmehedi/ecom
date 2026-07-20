import { money } from "@/lib/format";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
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
  const session = await auth();
  if (!hasPermission(session, "reports.view")) redirect("/dashboard");
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Net sales" value={money(pl.netSales)} />
        <Stat label="Gross profit" value={money(pl.grossProfit)} />
        <Stat label="Expenses" value={money(pl.totalExpenses)} />
        <Stat
          label="Net profit"
          value={money(pl.netProfit)}
          tone={pl.netProfit < 0 ? "bad" : "good"}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Gross profit">
          <p className="pb-2 text-sm text-muted-foreground">
            What the goods earned over what they cost. It is not yet what you made.
          </p>
          <Line label="Net sales" value={pl.netSales} muted />
          <Line label="Net cost of goods" value={-pl.netCogs} muted />
          <Line label="Gross profit" value={pl.grossProfit} strong />
          {pl.marginPct != null && (
            <p className="pt-1 text-right text-sm text-muted-foreground">
              Margin {pl.marginPct.toFixed(2)}%
            </p>
          )}
        </Block>

        <Block title="Operating expenses">
          {pl.expenses.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No expenses in this period. Rent, electricity and wages belong here — until
              they are recorded, the net profit below is flattering.
            </p>
          ) : (
            <>
              {pl.expenses.map((e) => (
                <Line key={e.name} label={e.name} value={-e.amount} muted />
              ))}
              <Line label="Total expenses" value={-pl.totalExpenses} strong />
            </>
          )}
        </Block>
      </div>

      <div className="report-surface rounded-lg border border-primary/40 bg-primary/5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-medium">Net profit</h2>
            <p className="text-sm text-muted-foreground">
              Gross profit {money(pl.grossProfit)} − expenses {money(pl.totalExpenses)}
            </p>
          </div>
          <p
            className={cn(
              "text-3xl font-semibold tabular-nums",
              pl.netProfit < 0 ? "text-destructive" : "text-primary",
            )}
          >
            {money(pl.netProfit)}
          </p>
        </div>
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
          This is the figure that answers &ldquo;did I make money this month?&rdquo;
          {pl.netMarginPct != null && (
            <> Net margin on net sales: {pl.netMarginPct.toFixed(2)}%.</>
          )}
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
