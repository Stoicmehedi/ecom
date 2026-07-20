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

const isNegProfit = (row: Row, col: Column) =>
  col.key === "profit" && Number(row[col.key]) < 0;

/**
 * Every report renders through here, so they all foot their numbers the same
 * way and the totals line can never be forgotten.
 *
 * A report table carries 8–11 columns — far more than a phone is wide. Rather
 * than leave the important money columns off the right edge behind a horizontal
 * scroll, the same `ReportTable` renders **two ways from one source**: the wide
 * table on `sm` and up, and a stacked card per row on a phone. They are the
 * same rows and totals, so the two can never disagree (nor with the exports,
 * which read the same table object).
 */
export function ReportTableView({
  table,
  empty = "Nothing in this period.",
}: {
  table: ReportTable;
  empty?: string;
}) {
  return (
    <>
      <DesktopTable table={table} empty={empty} />
      <MobileCards table={table} empty={empty} />
    </>
  );
}

function DesktopTable({ table, empty }: { table: ReportTable; empty: string }) {
  const { columns, rows, totals } = table;

  return (
    <div className="report-surface hidden overflow-x-auto rounded-lg border border-border/70 bg-card shadow-sm sm:block">
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
                        isNegProfit(row, c) && "text-destructive",
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

/** The phone view: one card per row, so no figure hides off the right edge. */
function MobileCards({ table, empty }: { table: ReportTable; empty: string }) {
  const { columns, rows, totals } = table;

  if (rows.length === 0) {
    return (
      <div className="report-surface rounded-lg border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground shadow-sm sm:hidden">
        {empty}
      </div>
    );
  }

  // The linked identifier (invoice / purchase) is column 1 when a row links out;
  // otherwise the first column is the label (a day, a product). Whichever it is
  // becomes the card's heading, and the date column moves up beside it.
  return (
    <div className="space-y-2.5 sm:hidden">
      {rows.map((row, i) => {
        const href = row._href ? String(row._href) : null;
        const titleIdx = href ? 1 : 0;
        const subtitleIdx = titleIdx === 1 ? 0 : -1; // the date, when it exists
        const titleCol = columns[titleIdx];
        const detail = columns.filter(
          (_, ci) => ci !== titleIdx && ci !== subtitleIdx,
        );

        return (
          <div
            key={i}
            className="report-surface rounded-lg border border-border/70 bg-card p-3.5 shadow-sm"
          >
            <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
              <div className="min-w-0">
                {href ? (
                  <Link
                    href={href}
                    className="font-medium text-primary hover:underline"
                  >
                    {render(row, titleCol)}
                  </Link>
                ) : (
                  <span className="font-medium">{render(row, titleCol)}</span>
                )}
              </div>
              {subtitleIdx >= 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {render(row, columns[subtitleIdx])}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {detail.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">{c.label}</dt>
                  <dd
                    className={cn(
                      "text-[13px]",
                      isNumeric(c.type) && "tabular-nums",
                      isNegProfit(row, c) && "text-destructive",
                    )}
                  >
                    {render(row, c)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}

      {totals && (
        <div className="report-surface rounded-lg border border-primary/30 bg-primary/5 p-3.5 shadow-sm">
          <p className="mb-2 border-b border-border/60 pb-2 text-sm font-semibold">
            Total
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {columns
              .filter((c, i) => i !== 0 && totals[c.key] != null)
              .map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">{c.label}</dt>
                  <dd
                    className={cn(
                      "text-[13px] font-semibold",
                      isNumeric(c.type) && "tabular-nums",
                    )}
                  >
                    {render(totals, c)}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}
