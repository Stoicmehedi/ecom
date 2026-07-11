import { parseRange } from "@/lib/reports/range";
import { reportAccess } from "@/lib/reports/access";
import { parseGroupBy, parseStatus, salesReport } from "@/lib/reports/queries";
import { ReportShell, reportTabs } from "@/components/reports/report-shell";
import { ReportTableView } from "@/components/reports/report-table";
import { Forbidden } from "@/components/reports/forbidden";
import { SalesFilters } from "./filters";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { canView, canSeeProfit } = await reportAccess();
  if (!canView) return <Forbidden kind="reports" />;

  const params = await searchParams;
  const range = parseRange(params);

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const groupBy = parseGroupBy(one(params.groupBy));
  const status = parseStatus(one(params.status));

  const table = await salesReport({ range, groupBy, status });

  return (
    <ReportShell
      title="Sales"
      description="What went out the door, and whether it was paid for."
      active="sales"
      tabs={reportTabs(canSeeProfit)}
      range={range}
      exportKey="sales"
      toolbar={<SalesFilters groupBy={groupBy} status={status} />}
    >
      <ReportTableView table={table} empty="No sales in this period." />
    </ReportShell>
  );
}
