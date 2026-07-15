import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { MiniBarChart } from "@/components/app/mini-bar-chart";
import { money, num, shortDate } from "@/lib/format";

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function ymd(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function load() {
  const today = startOfToday();
  const since = new Date(today);
  since.setDate(since.getDate() - 13); // 14-day window, today inclusive

  const settings = await getSettings();

  const [todayAgg, cashAgg, receivable, trendRows, recent, products] =
    await Promise.all([
      prisma.sale.aggregate({
        where: { date: { gte: today } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.account.aggregate({
        where: { type: "CASH" },
        _sum: { balance: true },
      }),
      prisma.contact.aggregate({
        where: { type: "CUSTOMER", dueBalance: { gt: 0 } },
        _sum: { dueBalance: true },
      }),
      prisma.sale.findMany({
        where: { date: { gte: since } },
        select: { date: true, total: true },
      }),
      prisma.sale.findMany({
        orderBy: { id: "desc" },
        take: 6,
        select: {
          id: true,
          invoiceNo: true,
          total: true,
          status: true,
          date: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          name: true,
          alertQty: true,
          variants: { select: { id: true, label: true, sku: true, stockQty: true } },
        },
      }),
    ]);

  // Daily buckets for the trend chart.
  const buckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(ymd(d), 0);
  }
  for (const s of trendRows) {
    const k = ymd(new Date(s.date));
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + num(s.total));
  }
  const trend = [...buckets.entries()].map(([k, value]) => ({
    label: shortDate(new Date(k)),
    value,
  }));
  const trendTotal = trend.reduce((a, d) => a + d.value, 0);

  // A variant is low when it sits at or below its product's alert quantity
  // (falling back to the shop-wide default). Two columns can't be compared in the
  // query, so it's resolved here.
  const low: { name: string; sku: string; stock: number }[] = [];
  for (const p of products) {
    const threshold = num(p.alertQty ?? settings.defaultAlertQty);
    for (const v of p.variants) {
      const stock = num(v.stockQty);
      if (stock <= threshold) {
        low.push({
          name: v.label ? `${p.name} — ${v.label}` : p.name,
          sku: v.sku,
          stock,
        });
      }
    }
  }
  low.sort((a, b) => a.stock - b.stock);

  return {
    todayTotal: num(todayAgg._sum.total),
    todayCount: todayAgg._count,
    cash: num(cashAgg._sum.balance),
    receivable: num(receivable._sum.dueBalance),
    trend,
    trendTotal,
    recent,
    low,
    lowCount: low.length,
  };
}

export default async function DashboardPage() {
  const d = await load();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Today at a glance — sales, cash, and what needs attention."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={money(d.todayTotal)}
          hint={`${d.todayCount} sale${d.todayCount === 1 ? "" : "s"}`}
          tone="good"
        />
        <StatCard label="Cash in drawer" value={money(d.cash)} />
        <StatCard
          label="Customer dues"
          value={money(d.receivable)}
          hint="owed to the shop"
          tone={d.receivable > 0 ? "bad" : "default"}
        />
        <StatCard
          label="Low stock"
          value={String(d.lowCount)}
          hint="at or below alert level"
          tone={d.lowCount > 0 ? "bad" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Sales trend */}
        <section className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Sales · last 14 days
            </h2>
            <span className="text-sm font-semibold tabular-nums">
              {money(d.trendTotal)}
            </span>
          </div>
          <MiniBarChart data={d.trend} height={96} format={(n) => money(n)} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{d.trend[0]?.label}</span>
            <span>{d.trend[d.trend.length - 1]?.label}</span>
          </div>
        </section>

        {/* Low stock */}
        <section className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Low stock
            </h2>
            <Link href="/inventory" className="text-[11px] text-primary hover:underline">
              Inventory
            </Link>
          </div>
          {d.low.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nothing is low. 🎉
            </p>
          ) : (
            <ul className="space-y-1.5">
              {d.low.slice(0, 6).map((v) => (
                <li key={v.sku} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate">{v.name}</span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      v.stock <= 0 ? "text-destructive" : "text-amber-600 dark:text-amber-500"
                    }`}
                  >
                    {v.stock} left
                  </span>
                </li>
              ))}
              {d.low.length > 6 && (
                <li className="pt-1 text-[11px] text-muted-foreground">
                  +{d.low.length - 6} more
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* Recent sales */}
      <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent sales
          </h2>
          <Link href="/sales" className="text-[11px] text-primary hover:underline">
            All sales
          </Link>
        </div>
        {d.recent.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No sales yet. <Link href="/pos" className="text-primary underline">Open the POS</Link>.
          </p>
        ) : (
          <ul className="divide-y">
            {d.recent.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sales/${s.id}`}
                  className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-accent/40"
                >
                  <span className="w-24 font-medium">{s.invoiceNo}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {s.customer?.name ?? "—"}
                  </span>
                  <StatusBadge status={s.status} />
                  <span className="w-24 text-right tabular-nums">{money(s.total)}</span>
                  <span className="hidden w-24 text-right text-muted-foreground sm:block">
                    {shortDate(s.date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
