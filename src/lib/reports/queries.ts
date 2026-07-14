import { prisma } from "@/lib/prisma";
import { num } from "@/lib/format";
import { round2, round3 } from "@/lib/costing";
import type { DateRange } from "./range";
import { isNumeric, type Column, type ReportTable, type Row } from "./types";

/** Postgres returns numerics as strings; every raw aggregate lands here. */
const n = (v: unknown) => Number(v ?? 0) || 0;

/** Margin as a share of net sales. Zero sales has no margin — not a 0% one. */
const margin = (profit: number, netSales: number): number | null =>
  netSales === 0 ? null : round2((profit / netSales) * 100);

const pad = (v: number) => String(v).padStart(2, "0");

/** Local-time bucket key — a late-evening sale belongs to the day it was made. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// ---------------------------------------------------------------- Sales

export type SaleGroupBy = "invoice" | "day" | "month";

export const SALE_GROUPS: SaleGroupBy[] = ["invoice", "day", "month"];
export const SALE_STATUSES = ["PAID", "PARTIAL", "DUE"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

/** Only ever let a known enum value reach Prisma — a bad URL is not a 500. */
export function parseStatus(v: unknown): SaleStatus | undefined {
  return SALE_STATUSES.includes(v as SaleStatus) ? (v as SaleStatus) : undefined;
}

export function parseGroupBy(v: unknown): SaleGroupBy {
  return SALE_GROUPS.includes(v as SaleGroupBy) ? (v as SaleGroupBy) : "invoice";
}

export type SalesFilters = {
  range: DateRange;
  groupBy: SaleGroupBy;
  customerId?: number;
  status?: SaleStatus;
};

export async function salesReport(f: SalesFilters): Promise<ReportTable> {
  const where = {
    date: { gte: f.range.from, lte: f.range.to },
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };

  if (f.groupBy === "invoice") {
    const sales = await prisma.sale.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        customer: { select: { name: true, phone: true } },
        returns: { select: { total: true } },
      },
    });

    const rows: Row[] = sales.map((s) => ({
      date: s.date.toISOString(),
      invoice: s.invoiceNo,
      customer: s.customer?.name ?? "—",
      // Lines, not units — `itemsCount` is how many rows were on the bill.
      lines: s.itemsCount,
      subtotal: num(s.subtotal),
      discount: num(s.discount),
      total: num(s.total),
      paid: num(s.paid),
      due: num(s.due),
      // Everything ever handed back against this invoice, whenever it happened —
      // on *this* bill it never stuck.
      returned: round2(s.returns.reduce((a, r) => a + num(r.total), 0)),
      status: s.status,
      _href: `/sales/${s.id}`,
    }));

    const columns: Column[] = [
      { key: "date", label: "Date", type: "date" },
      { key: "invoice", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "lines", label: "Lines", type: "int" },
      { key: "subtotal", label: "Subtotal", type: "money" },
      { key: "discount", label: "Discount", type: "money" },
      { key: "total", label: "Total", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "due", label: "Due", type: "money" },
      { key: "returned", label: "Returned", type: "money" },
      { key: "status", label: "Status" },
    ];

    return { title: "Sales", columns, rows, totals: totalsFor(rows, columns) };
  }

  // Day / month. Returns are bucketed by the date they *happened*, exactly as
  // the P&L counts them — so "Net sales" here means the same thing there.
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: { date: true, itemsCount: true, subtotal: true, discount: true, total: true, paid: true, due: true },
    }),
    prisma.saleReturn.findMany({
      where: { date: { gte: f.range.from, lte: f.range.to } },
      select: { date: true, total: true },
    }),
  ]);

  const key = f.groupBy === "day" ? dayKey : monthKey;
  type Bucket = {
    invoices: number;
    lines: number;
    subtotal: number;
    discount: number;
    sold: number;
    returned: number;
    paid: number;
    due: number;
  };
  const empty = (): Bucket => ({
    invoices: 0,
    lines: 0,
    subtotal: 0,
    discount: 0,
    sold: 0,
    returned: 0,
    paid: 0,
    due: 0,
  });

  const buckets = new Map<string, Bucket>();
  const at = (d: Date) => {
    const k = key(d);
    const b = buckets.get(k) ?? empty();
    buckets.set(k, b);
    return b;
  };

  for (const s of sales) {
    const b = at(s.date);
    b.invoices += 1;
    b.lines += s.itemsCount;
    b.subtotal += num(s.subtotal);
    b.discount += num(s.discount);
    b.sold += num(s.total);
    b.paid += num(s.paid);
    b.due += num(s.due);
  }
  for (const r of returns) at(r.date).returned += num(r.total);

  const rows: Row[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([k, b]) => ({
      period: periodLabel(k),
      invoices: b.invoices,
      lines: b.lines,
      subtotal: round2(b.subtotal),
      discount: round2(b.discount),
      returned: round2(b.returned),
      net: round2(b.sold - b.returned),
      paid: round2(b.paid),
      due: round2(b.due),
    }));

  const columns: Column[] = [
    { key: "period", label: f.groupBy === "day" ? "Day" : "Month" },
    { key: "invoices", label: "Invoices", type: "int" },
    { key: "lines", label: "Lines", type: "int" },
    { key: "subtotal", label: "Subtotal", type: "money" },
    { key: "discount", label: "Discount", type: "money" },
    { key: "returned", label: "Returned", type: "money" },
    { key: "net", label: "Net sales", type: "money" },
    { key: "paid", label: "Paid", type: "money" },
    { key: "due", label: "Due", type: "money" },
  ];

  return {
    title: f.groupBy === "day" ? "Sales by day" : "Sales by month",
    columns,
    rows,
    totals: totalsFor(rows, columns),
  };
}

// ---------------------------------------------------------- Profit & Loss

export type ProfitLoss = {
  grossSales: number; // before the order discount
  discount: number;
  saleReturns: number; // at the price the goods actually sold for
  netSales: number;
  cogs: number; // what the goods sold cost us (costAtSale)
  returnedCost: number; // what the goods that came back had cost us
  netCogs: number;
  grossProfit: number;
  marginPct: number | null;
  invoices: number;
  itemsSold: number;
  // Operating expenses (BLUEPRINT §18) — what turns gross profit into real profit.
  expenses: { name: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  netMarginPct: number | null;
  // Cash context — shown alongside, never folded into profit.
  purchases: number;
  purchaseReturns: number;
  cashIn: number;
  cashOut: number;
};

export async function profitLoss(range: DateRange): Promise<ProfitLoss> {
  const { from, to } = range;

  const [
    saleAgg,
    soldRaw,
    returnedRaw,
    purchaseAgg,
    purchaseReturnAgg,
    payIn,
    payOut,
    expenseAgg,
    expenseTypes,
  ] = await Promise.all([
      prisma.sale.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum: { subtotal: true, discount: true, total: true },
        _count: true,
      }),
      // Prisma can't sum a product of two columns — this has to be raw.
      prisma.$queryRaw<{ cogs: string; qty: string }[]>`
        SELECT COALESCE(SUM(si.qty * si."costAtSale"), 0)::text AS cogs,
               COALESCE(SUM(si.qty), 0)::text                   AS qty
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        WHERE s.date >= ${from} AND s.date <= ${to}
      `,
      // `ri.price` is what the goods actually sold for — the sale's discount is
      // already shared into it when the return is written. So this subtracts
      // like for like from the discount-net sales figure above.
      prisma.$queryRaw<{ cost: string; value: string }[]>`
        SELECT COALESCE(SUM(ri.qty * ri.cost), 0)::text  AS cost,
               COALESCE(SUM(ri.qty * ri.price), 0)::text AS value
        FROM "SaleReturnItem" ri
        JOIN "SaleReturn" r ON r.id = ri."returnId"
        WHERE r.date >= ${from} AND r.date <= ${to}
      `,
      prisma.purchase.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum: { total: true },
      }),
      prisma.purchaseReturn.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum: { total: true },
      }),
      prisma.payment.aggregate({
        where: { date: { gte: from, lte: to }, direction: "IN" },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { date: { gte: from, lte: to }, direction: "OUT" },
        _sum: { amount: true },
      }),
      // Expenses in the period, grouped by what they were for. Keyed off the expense
      // *date*, never its creation time — the shop books December's rent on 31-Dec
      // whenever it gets round to entering it (§18.8).
      prisma.expense.groupBy({
        by: ["expenseTypeId"],
        where: { date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.expenseType.findMany({ select: { id: true, name: true } }),
    ]);

  const grossSales = num(saleAgg._sum.subtotal);
  const discount = num(saleAgg._sum.discount);
  const soldNet = num(saleAgg._sum.total); // subtotal − discount
  const saleReturns = n(returnedRaw[0]?.value);
  const netSales = round2(soldNet - saleReturns);

  const cogs = round2(n(soldRaw[0]?.cogs));
  const returnedCost = round2(n(returnedRaw[0]?.cost));
  const netCogs = round2(cogs - returnedCost);

  const grossProfit = round2(netSales - netCogs);

  // A contra entry (a returned loyalty redemption) is a negative row, so it nets
  // itself out here rather than needing a special case.
  const typeName = new Map(expenseTypes.map((t) => [t.id, t.name]));
  const expenses = expenseAgg
    .map((g) => ({
      name: typeName.get(g.expenseTypeId) ?? "Unknown",
      amount: round2(num(g._sum.amount)),
    }))
    .filter((e) => e.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const netProfit = round2(grossProfit - totalExpenses);

  return {
    grossSales: round2(grossSales),
    discount: round2(discount),
    saleReturns: round2(saleReturns),
    netSales,
    cogs,
    returnedCost,
    netCogs,
    grossProfit,
    marginPct: margin(grossProfit, netSales),
    invoices: saleAgg._count,
    itemsSold: round3(n(soldRaw[0]?.qty)),
    expenses,
    totalExpenses,
    netProfit,
    netMarginPct: margin(netProfit, netSales),
    purchases: round2(num(purchaseAgg._sum.total)),
    purchaseReturns: round2(num(purchaseReturnAgg._sum.total)),
    cashIn: round2(num(payIn._sum.amount)),
    cashOut: round2(num(payOut._sum.amount)),
  };
}

/** The same P&L, flattened for CSV/Excel. */
export function profitLossTable(pl: ProfitLoss, range: DateRange): ReportTable {
  const line = (item: string, amount: number | null) => ({ item, amount, pct: null });
  return {
    title: `Profit & Loss — ${range.label}`,
    columns: [
      { key: "item", label: "Item" },
      { key: "amount", label: "Amount", type: "money" },
      // The margin is a percentage, so it gets its own column rather than being
      // smuggled into a money one — where a reader (and Excel) would take 53.70
      // for money rather than 53.70%.
      { key: "pct", label: "Percent", type: "percent" },
    ],
    rows: [
      line("Gross sales", pl.grossSales),
      line("Discount given", -pl.discount),
      line("Sale returns", -pl.saleReturns),
      line("Net sales", pl.netSales),
      line("Cost of goods sold", pl.cogs),
      line("Cost of goods returned", -pl.returnedCost),
      line("Net cost of goods", pl.netCogs),
      line("Gross profit", pl.grossProfit),
      { item: "Margin on net sales", amount: null, pct: pl.marginPct },
      // Operating expenses — the block that turns gross profit into real profit (§18.5).
      ...pl.expenses.map((e) => line(`  ${e.name}`, -e.amount)),
      line("Total expenses", -pl.totalExpenses),
      line("Net profit", pl.netProfit),
      { item: "Net margin on net sales", amount: null, pct: pl.netMarginPct },
      line("Purchases (inventory, not an expense)", pl.purchases),
      line("Purchase returns", pl.purchaseReturns),
      line("Cash in", pl.cashIn),
      line("Cash out", pl.cashOut),
    ],
  };
}

// -------------------------------------------------------- Product profit

export type ProductFilters = {
  range: DateRange;
  categoryId?: number;
  brandId?: number;
};

type VariantRow = {
  variantId: number;
  name: string;
  label: string | null;
  sku: string;
};

export async function productProfit(f: ProductFilters): Promise<ReportTable> {
  const { from, to } = f.range;

  // The order-level discount lives on the sale, not the line — so it is shared
  // out across the lines in proportion to what each contributed to the bill.
  // Without this, the product profits would sum to more than the P&L's gross
  // profit by exactly the discount given, and the two reports would disagree.
  const soldRaw = await prisma.$queryRaw<
    (VariantRow & { soldQty: string; soldValue: string; soldCost: string })[]
  >`
    SELECT v.id            AS "variantId",
           p.name          AS name,
           v.label         AS label,
           v.sku           AS sku,
           COALESCE(SUM(si.qty), 0)::text                   AS "soldQty",
           COALESCE(SUM(
             si.qty * si.price
             - CASE WHEN s.subtotal > 0
                    THEN s."discount" * (si.qty * si.price) / s.subtotal
                    ELSE 0 END
           ), 0)::text                                      AS "soldValue",
           COALESCE(SUM(si.qty * si."costAtSale"), 0)::text AS "soldCost"
    FROM "SaleItem" si
    JOIN "Sale" s           ON s.id = si."saleId"
    JOIN "ProductVariant" v ON v.id = si."variantId"
    JOIN "Product" p        ON p.id = v."productId"
    WHERE s.date >= ${from} AND s.date <= ${to}
    GROUP BY v.id, p.name, v.label, v.sku
  `;

  // Returns carry their own product identity, because goods sold in an earlier
  // period can come back in this one. Keying them off the sold set would drop
  // those returns silently and break the reconciliation with the P&L.
  const returnedRaw = await prisma.$queryRaw<
    (VariantRow & { retQty: string; retValue: string; retCost: string })[]
  >`
    SELECT v.id     AS "variantId",
           p.name   AS name,
           v.label  AS label,
           v.sku    AS sku,
           COALESCE(SUM(ri.qty), 0)::text            AS "retQty",
           COALESCE(SUM(ri.qty * ri.price), 0)::text AS "retValue",
           COALESCE(SUM(ri.qty * ri.cost), 0)::text  AS "retCost"
    FROM "SaleReturnItem" ri
    JOIN "SaleReturn" r     ON r.id = ri."returnId"
    JOIN "ProductVariant" v ON v.id = ri."variantId"
    JOIN "Product" p        ON p.id = v."productId"
    WHERE r.date >= ${from} AND r.date <= ${to}
    GROUP BY v.id, p.name, v.label, v.sku
  `;

  let allowed: Set<number> | null = null;
  if (f.categoryId || f.brandId) {
    const vs = await prisma.productVariant.findMany({
      where: {
        product: {
          ...(f.categoryId ? { categoryId: f.categoryId } : {}),
          ...(f.brandId ? { brandId: f.brandId } : {}),
        },
      },
      select: { id: true },
    });
    allowed = new Set(vs.map((v) => v.id));
  }

  // Union of everything sold *or* returned in the window.
  type Agg = VariantRow & {
    soldQty: number;
    soldValue: number;
    soldCost: number;
    retQty: number;
    retValue: number;
    retCost: number;
  };
  const byVariant = new Map<number, Agg>();
  const slot = (v: VariantRow): Agg => {
    const existing = byVariant.get(v.variantId);
    if (existing) return existing;
    const fresh: Agg = {
      ...v,
      soldQty: 0,
      soldValue: 0,
      soldCost: 0,
      retQty: 0,
      retValue: 0,
      retCost: 0,
    };
    byVariant.set(v.variantId, fresh);
    return fresh;
  };

  for (const r of soldRaw) {
    const a = slot(r);
    a.soldQty += n(r.soldQty);
    a.soldValue += n(r.soldValue);
    a.soldCost += n(r.soldCost);
  }
  for (const r of returnedRaw) {
    const a = slot(r);
    a.retQty += n(r.retQty);
    a.retValue += n(r.retValue);
    a.retCost += n(r.retCost);
  }

  const rows: Row[] = [...byVariant.values()]
    .filter((a) => !allowed || allowed.has(a.variantId))
    .map((a) => {
      const salesValue = round2(a.soldValue - a.retValue);
      const costValue = round2(a.soldCost - a.retCost);
      const profit = round2(salesValue - costValue);
      return {
        product: a.label ? `${a.name} — ${a.label}` : a.name,
        sku: a.sku,
        soldQty: round3(a.soldQty),
        retQty: round3(a.retQty),
        netQty: round3(a.soldQty - a.retQty),
        salesValue,
        costValue,
        profit,
        marginPct: margin(profit, salesValue),
      };
    })
    .sort((a, b) => Number(b.profit) - Number(a.profit));

  const columns: Column[] = [
    { key: "product", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "soldQty", label: "Sold", type: "qty" },
    { key: "retQty", label: "Returned", type: "qty" },
    { key: "netQty", label: "Net qty", type: "qty" },
    { key: "salesValue", label: "Sales value", type: "money" },
    { key: "costValue", label: "Cost value", type: "money" },
    { key: "profit", label: "Profit", type: "money" },
    { key: "marginPct", label: "Margin", type: "percent" },
  ];

  const totals = totalsFor(rows, columns);
  // The total margin is the margin on the totals — not the average of the rows'.
  totals.marginPct = margin(Number(totals.profit ?? 0), Number(totals.salesValue ?? 0));

  return { title: "Product profit", columns, rows, totals };
}

// ------------------------------------------------------------------ Dues

export type DueSide = "receivable" | "payable";

/** Dues are a snapshot of what is outstanding *now* — a date range would lie. */
export async function duesReport(side: DueSide): Promise<ReportTable> {
  const today = new Date();
  const ageDays = (d: Date) =>
    Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86_400_000));

  if (side === "receivable") {
    const [sales, customers] = await Promise.all([
      prisma.sale.findMany({
        where: { due: { gt: 0 } },
        orderBy: { date: "asc" },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      }),
      prisma.contact.findMany({
        where: { type: "CUSTOMER" },
        select: {
          id: true,
          name: true,
          phone: true,
          dueBalance: true,
          createdAt: true,
        },
      }),
    ]);

    // Not everything a customer owes is on an invoice, and not everything they hold
    // is a debt (§22.2). Whatever their account carries beyond their open invoices is
    // either a balance they walked in with (positive) or an advance sitting to their
    // credit (negative) — and BOTH need a row, or this invoice-level report cannot
    // add up to the account-level balance on their own page.
    //
    // Derived, not read from `openingBalance`: that column never moves, so it would
    // still claim 500 after 500 had been paid off.
    const invoiced = new Map<number, number>();
    for (const s of sales) {
      if (!s.customerId) continue;
      invoiced.set(s.customerId, round2((invoiced.get(s.customerId) ?? 0) + num(s.due)));
    }

    const rows: Row[] = [
      ...customers
        .map((c) => ({
          c,
          rest: round2(num(c.dueBalance) - (invoiced.get(c.id) ?? 0)),
        }))
        .filter(({ rest }) => Math.abs(rest) > 0.005)
        .map(({ c, rest }) => ({
          date: c.createdAt.toISOString(),
          invoice: rest > 0 ? "Opening balance" : "Advance on account",
          customer: c.name,
          phone: c.phone ?? "",
          total: rest,
          paid: 0,
          due: rest,
          age: ageDays(c.createdAt),
          _href: `/customers/${c.id}`,
        })),
      ...sales.map((s) => ({
        date: s.date.toISOString(),
        invoice: s.invoiceNo,
        customer: s.customer?.name ?? "—",
        phone: s.customer?.phone ?? "",
        total: num(s.total),
        paid: num(s.paid),
        due: num(s.due),
        age: ageDays(s.date),
        _href: `/sales/${s.id}`,
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const columns: Column[] = [
      { key: "date", label: "Date", type: "date" },
      { key: "invoice", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "total", label: "Total", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "due", label: "Due", type: "money" },
      { key: "age", label: "Age (days)", type: "int" },
    ];

    return {
      title: "Receivable — what customers owe",
      columns,
      rows,
      totals: totalsFor(rows, columns, ["age"]),
    };
  }

  const purchases = await prisma.purchase.findMany({
    where: { due: { gt: 0 } },
    orderBy: { date: "asc" },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
  });

  const rows: Row[] = purchases.map((p) => ({
    date: p.date.toISOString(),
    purchase: p.purchaseNo,
    supplier: p.supplier?.name ?? "—",
    phone: p.supplier?.phone ?? "",
    total: num(p.total),
    paid: num(p.paid),
    due: num(p.due),
    age: ageDays(p.date),
    _href: `/purchases/${p.id}`,
  }));

  const columns: Column[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "purchase", label: "Purchase" },
    { key: "supplier", label: "Supplier" },
    { key: "phone", label: "Phone" },
    { key: "total", label: "Total", type: "money" },
    { key: "paid", label: "Paid", type: "money" },
    { key: "due", label: "Due", type: "money" },
    { key: "age", label: "Age (days)", type: "int" },
  ];

  return {
    title: "Payable — what we owe suppliers",
    columns,
    rows,
    totals: totalsFor(rows, columns, ["age"]),
  };
}

// -------------------------------------------------------------- Overview

/**
 * Net sales per day across the range — sales that day less returns that day,
 * the same arithmetic the P&L does, so the bar strip and the P&L agree.
 */
export async function salesByDay(
  range: DateRange,
): Promise<{ day: string; total: number }[]> {
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: { date: { gte: range.from, lte: range.to } },
      select: { date: true, total: true },
    }),
    prisma.saleReturn.findMany({
      where: { date: { gte: range.from, lte: range.to } },
      select: { date: true, total: true },
    }),
  ]);

  const byDay = new Map<string, number>();
  for (const s of sales) {
    const k = dayKey(s.date);
    byDay.set(k, (byDay.get(k) ?? 0) + num(s.total));
  }
  for (const r of returns) {
    const k = dayKey(r.date);
    byDay.set(k, (byDay.get(k) ?? 0) - num(r.total));
  }

  // Every day in the range, including the ones with no sales — a gap is a fact.
  const out: { day: string; total: number }[] = [];
  const cur = new Date(range.from);
  while (cur <= range.to) {
    const k = dayKey(cur);
    out.push({ day: k, total: round2(byDay.get(k) ?? 0) });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Totals of what is outstanding right now, both directions. */
export async function dueTotals() {
  const [recv, pay] = await Promise.all([
    prisma.sale.aggregate({ where: { due: { gt: 0 } }, _sum: { due: true } }),
    prisma.purchase.aggregate({ where: { due: { gt: 0 } }, _sum: { due: true } }),
  ]);
  return {
    receivable: round2(num(recv._sum.due)),
    payable: round2(num(pay._sum.due)),
  };
}

// ----------------------------------------------------------------- utils

function periodLabel(key: string): string {
  const [y, m, d] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, d ? Number(d) : 1);
  return d
    ? date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Foot every numeric column, at the precision that column is displayed to —
 * summing a 3-decimal quantity column and rounding it to 2 would leave the
 * total not adding up to the rows above it.
 */
function totalsFor(rows: Row[], columns: Column[], skip: string[] = []): Row {
  const out: Row = {};
  for (const c of columns) {
    if (!isNumeric(c.type) || skip.includes(c.key)) continue;
    const sum = rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
    out[c.key] = c.type === "qty" ? round3(sum) : round2(sum);
  }
  return out;
}
