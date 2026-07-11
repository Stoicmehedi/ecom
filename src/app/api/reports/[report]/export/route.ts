import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { parseRange, toDateStr } from "@/lib/reports/range";
import {
  duesReport,
  parseGroupBy,
  parseStatus,
  productProfit,
  profitLoss,
  profitLossTable,
  salesReport,
  type DueSide,
} from "@/lib/reports/queries";
import { exportFilename, toCsv, toXlsx } from "@/lib/reports/export";
import type { ReportTable } from "@/lib/reports/types";

/** Reports that reveal cost or margin. Same gate as the screens. */
const PROFIT_REPORTS = new Set(["profit-loss", "products"]);

const intOrUndefined = (v: string | null) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { report } = await params;
  const q = req.nextUrl.searchParams;

  const needs = PROFIT_REPORTS.has(report) ? "reports.profit" : "reports.view";
  if (!hasPermission(session, needs)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const format = q.get("format") === "xlsx" ? "xlsx" : "csv";
  const range = parseRange(Object.fromEntries(q.entries()));

  let table: ReportTable;
  switch (report) {
    case "sales":
      table = await salesReport({
        range,
        groupBy: parseGroupBy(q.get("groupBy")),
        customerId: intOrUndefined(q.get("customerId")),
        status: parseStatus(q.get("status")),
      });
      break;
    case "profit-loss":
      table = profitLossTable(await profitLoss(range), range);
      break;
    case "products":
      table = await productProfit({
        range,
        categoryId: intOrUndefined(q.get("categoryId")),
        brandId: intOrUndefined(q.get("brandId")),
      });
      break;
    case "dues": {
      const side = (q.get("side") === "payable" ? "payable" : "receivable") as DueSide;
      table = await duesReport(side);
      break;
    }
    default:
      return NextResponse.json({ error: "No such report." }, { status: 404 });
  }

  const stamp = toDateStr(new Date());
  const filename = exportFilename(report, format, stamp);

  if (format === "csv") {
    return new NextResponse(toCsv(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buf = await toXlsx(table, { subtitle: range.label });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
