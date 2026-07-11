import { prisma } from "@/lib/prisma";
import { parseRange } from "@/lib/reports/range";
import { reportAccess } from "@/lib/reports/access";
import { productProfit } from "@/lib/reports/queries";
import { ReportShell, reportTabs } from "@/components/reports/report-shell";
import { ReportTableView } from "@/components/reports/report-table";
import { Forbidden } from "@/components/reports/forbidden";
import { ProductFilters } from "./filters";

export default async function ProductProfitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { canView, canSeeProfit } = await reportAccess();
  if (!canView) return <Forbidden kind="reports" />;
  if (!canSeeProfit) return <Forbidden />;

  const params = await searchParams;
  const range = parseRange(params);

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const int = (v: string | undefined) => {
    const n = Number(v);
    return v && Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const categoryId = int(one(params.categoryId));
  const brandId = int(one(params.brandId));

  const [table, categories, brands] = await Promise.all([
    productProfit({ range, categoryId, brandId }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <ReportShell
      title="Product profit"
      description="Which products earn their shelf space — and which don't."
      active="products"
      tabs={reportTabs(true)}
      range={range}
      exportKey="products"
      toolbar={
        <ProductFilters
          categories={categories}
          brands={brands}
          categoryId={categoryId}
          brandId={brandId}
        />
      }
    >
      <ReportTableView
        table={table}
        empty="Nothing was sold in this period."
      />
      <p className="text-xs text-muted-foreground">
        Sorted by profit. Quantities and values are net of anything returned in this
        period, so the totals reconcile with the Profit &amp; Loss report.
      </p>
    </ReportShell>
  );
}
