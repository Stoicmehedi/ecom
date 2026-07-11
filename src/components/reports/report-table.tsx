import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, qty as fmtQty, shortDate } from "@/lib/format";
import { isNumeric, type Column, type ReportTable, type Row } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

function render(row: Row, col: Column): string {
  const v = row[col.key];
  if (v == null || v === "") return "—";
  switch (col.type) {
    case "date":
      return shortDate(new Date(String(v)));
    case "money":
      return money(Number(v));
    case "qty":
      return fmtQty(Number(v));
    case "int":
      return String(Math.round(Number(v)));
    case "percent":
      return `${Number(v).toFixed(2)}%`;
    default:
      return String(v);
  }
}

/**
 * Every report renders through here, so they all foot their numbers the same
 * way and the totals line can never be forgotten.
 */
export function ReportTableView({
  table,
  empty = "Nothing in this period.",
}: {
  table: ReportTable;
  empty?: string;
}) {
  const { columns, rows, totals } = table;

  return (
    <div className="report-surface overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn(isNumeric(c.type) && "text-right")}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          )}

          {rows.map((row, i) => {
            const href = row._href ? String(row._href) : null;
            return (
              <TableRow key={i}>
                {columns.map((c, ci) => {
                  const content = render(row, c);
                  const linked = href && ci === 1; // the identifier column
                  return (
                    <TableCell
                      key={c.key}
                      className={cn(
                        isNumeric(c.type) && "text-right tabular-nums",
                        c.key === "profit" &&
                          Number(row[c.key]) < 0 &&
                          "text-destructive",
                      )}
                    >
                      {linked ? (
                        <Link
                          href={href}
                          className="font-medium text-primary hover:underline"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>

        {totals && rows.length > 0 && (
          <TableFooter>
            <TableRow>
              {columns.map((c, i) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    "font-semibold",
                    isNumeric(c.type) && "text-right tabular-nums",
                  )}
                >
                  {i === 0
                    ? "Total"
                    : totals[c.key] == null
                      ? ""
                      : render(totals, c)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
