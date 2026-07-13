// Independent re-computation of every report figure, straight from the rows,
// checked against what the report functions return.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseRange } from "../src/lib/reports/range";
import { paidRatio } from "../src/lib/costing";
import {
  profitLoss,
  productProfit,
  salesReport,
  duesReport,
} from "../src/lib/reports/queries";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const N = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = Math.abs(N(got) - N(want)) < 0.005;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label.padEnd(38)} got ${String(got).padStart(10)}   want ${String(want)}`);
}

async function main() {
  const range = parseRange({ preset: "today" });
  console.log(`Range: ${range.label}\n`);

  // ---- Recompute the truth from raw rows, by hand.
  const sales = await prisma.sale.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    include: { items: true },
  });
  const rets = await prisma.saleReturn.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    include: { items: true },
  });

  const grossSales = r2(sales.reduce((a, s) => a + N(s.subtotal), 0));
  const discount = r2(sales.reduce((a, s) => a + N(s.discount), 0));
  const soldNet = r2(sales.reduce((a, s) => a + N(s.total), 0));
  const cogs = r2(
    sales.reduce((a, s) => a + s.items.reduce((b, i) => b + N(i.qty) * N(i.costAtSale), 0), 0),
  );
  const retValue = r2(
    rets.reduce((a, r) => a + r.items.reduce((b, i) => b + N(i.qty) * N(i.price), 0), 0),
  );
  const retCost = r2(
    rets.reduce((a, r) => a + r.items.reduce((b, i) => b + N(i.qty) * N(i.cost), 0), 0),
  );
  const netSales = r2(soldNet - retValue);
  const netCogs = r2(cogs - retCost);
  const grossProfit = r2(netSales - netCogs);

  console.log("Hand-computed from rows:");
  console.log(`  gross sales ${grossSales}, discount ${discount}, returns ${retValue}`);
  console.log(`  net sales ${netSales} = ${soldNet} − ${retValue}`);
  console.log(`  COGS ${cogs} − returned cost ${retCost} = net COGS ${netCogs}`);
  console.log(`  gross profit ${grossProfit} = ${netSales} − ${netCogs}\n`);

  // ---- Profit & Loss
  console.log("Profit & Loss report:");
  const pl = await profitLoss(range);
  check("gross sales", pl.grossSales, grossSales);
  check("discount", pl.discount, discount);
  check("sale returns", pl.saleReturns, retValue);
  check("net sales", pl.netSales, netSales);
  check("COGS", pl.cogs, cogs);
  check("returned cost", pl.returnedCost, retCost);
  check("net COGS", pl.netCogs, netCogs);
  check("gross profit", pl.grossProfit, grossProfit);
  check("margin %", pl.marginPct ?? 0, netSales ? r2((grossProfit / netSales) * 100) : 0);
  check("invoices", pl.invoices, sales.length);

  // ---- Expenses → net profit (BLUEPRINT §18.5). Recomputed from the raw rows, so a
  // contra entry (a returned loyalty redemption is a negative row) has to net itself
  // out here exactly as it does in the report.
  const expenseRows = await prisma.expense.findMany({
    where: { date: { gte: range.from, lte: range.to } },
  });
  const totalExpenses = r2(expenseRows.reduce((a, e) => a + N(e.amount), 0));
  const netProfit = r2(grossProfit - totalExpenses);
  console.log(
    `\n  expenses ${totalExpenses} over ${expenseRows.length} row(s) → ` +
      `net profit ${netProfit} = ${grossProfit} − ${totalExpenses}`,
  );
  check("total expenses", pl.totalExpenses, totalExpenses);
  check("Σ expense breakdown == total", r2(pl.expenses.reduce((a, e) => a + e.amount, 0)), totalExpenses);
  check("net profit", pl.netProfit, netProfit);

  // The loyalty scheme's cost must equal what customers actually spent in points
  // over the period, net of any handed back on a return (§18.8). If these two ever
  // disagree, either the expense or the points ledger is lying.
  const pointsPaid = await prisma.payment.aggregate({
    where: { date: { gte: range.from, lte: range.to }, method: "POINTS" },
    _sum: { amount: true },
  });
  const loyaltyExpense = r2(
    expenseRows
      .filter((e) => e.saleId !== null)
      .reduce((a, e) => a + N(e.amount), 0),
  );
  const pointsRefunded = r2(
    rets.reduce((a, r) => a + (N(r.total) - N(r.moneyCredit)), 0),
  );
  check(
    "loyalty expense == points spent − returned",
    loyaltyExpense,
    r2(N(pointsPaid._sum.amount) - pointsRefunded),
  );

  // ---- Product profit must reconcile with the P&L. This is the real test.
  console.log("\nProduct profit — reconciles with P&L?");
  const pp = await productProfit({ range });
  check("Σ sales value  == P&L net sales", pp.totals?.salesValue, pl.netSales);
  check("Σ cost value   == P&L net COGS", pp.totals?.costValue, pl.netCogs);
  check("Σ profit       == P&L gross profit", pp.totals?.profit, pl.grossProfit);

  // ---- Sales report
  console.log("\nSales report:");
  const inv = await salesReport({ range, groupBy: "invoice" });
  check("rows == sales in range", inv.rows.length, sales.length);
  check("Σ total", inv.totals?.total, soldNet);
  check("Σ due", inv.totals?.due, r2(sales.reduce((a, s) => a + N(s.due), 0)));

  const byDay = await salesReport({ range, groupBy: "day" });
  check("day grouping Σ invoices", byDay.totals?.invoices, sales.length);
  check("day grouping Σ subtotal", byDay.totals?.subtotal, grossSales);
  // The grouped view's "Net sales" must mean exactly what the P&L means by it,
  // or two reports covering one period quietly disagree.
  check("day grouping Σ net == P&L net sales", byDay.totals?.net, pl.netSales);

  const byMonth = await salesReport({ range, groupBy: "month" });
  check("month grouping Σ net == P&L net sales", byMonth.totals?.net, pl.netSales);

  // ---- Dues
  console.log("\nDues:");
  const recv = await duesReport("receivable");
  const openSales = await prisma.sale.findMany({ where: { due: { gt: 0 } } });
  check("receivable Σ due", recv.totals?.due, r2(openSales.reduce((a, s) => a + N(s.due), 0)));
  check("receivable rows", recv.rows.length, openSales.length);

  const pay = await duesReport("payable");
  const openPur = await prisma.purchase.findMany({ where: { due: { gt: 0 } } });
  check("payable Σ due", pay.totals?.due, r2(openPur.reduce((a, p) => a + N(p.due), 0)));

  // ---- Returns must be credited at what the customer actually paid.
  // A return line priced at list would hand back money that was never taken on
  // any discounted bill — so check every return line against its sale's ratio.
  console.log("\nReturns priced at what the customer actually paid:");
  const allReturns = await prisma.saleReturn.findMany({
    include: { items: { include: { saleItem: true } }, sale: true },
  });
  for (const ret of allReturns) {
    const ratio = paidRatio(N(ret.sale.subtotal), N(ret.sale.discount));
    for (const it of ret.items) {
      check(
        `${ret.returnNo} ${it.saleItem.id} unit price`,
        N(it.price),
        r2(N(it.saleItem.price) * ratio),
      );
    }
  }

  console.log(
    failures === 0
      ? "\nAll report figures agree with the underlying rows."
      : `\n${failures} MISMATCH(ES).`,
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main();
