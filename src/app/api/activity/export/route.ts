import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { exportFilename, toCsv, toXlsx } from "@/lib/reports/export";
import { toDateStr } from "@/lib/reports/range";
import {
  activityTable,
  parseActivityFilters,
  queryActivity,
} from "@/lib/activity-query";

/**
 * The export that actually holds the gate (§29.3): a page guard is a courtesy, this
 * is the one a forged request meets. Same `activity.view` key as the screen.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!hasPermission(session, "activity.view")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "xlsx" ? "xlsx" : "csv";

  // Export every row that matches the filters, not just the page on screen.
  const filters = parseActivityFilters(Object.fromEntries(q.entries()));
  const { rows } = await queryActivity({ ...filters, page: 1, perPage: 100_000 });
  const table = activityTable(rows);

  const stamp = toDateStr(new Date());
  const filename = exportFilename("activity-log", format, stamp);

  if (format === "csv") {
    return new NextResponse(toCsv(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buf = await toXlsx(table, { subtitle: `${rows.length} entries` });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
