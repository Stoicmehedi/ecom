/**
 * A report is a table: columns, rows, and a totals line.
 *
 * Every report is defined once, in this shape, and both the screen and the
 * CSV/Excel exports render from it — so an export can never disagree with what
 * the user is looking at.
 */

export type ColumnType = "text" | "date" | "int" | "qty" | "money" | "percent";

export type Column = {
  key: string;
  label: string;
  /** Defaults to "text". Numeric types right-align and foot in the totals row. */
  type?: ColumnType;
};

/** Keys starting with "_" are presentation-only (e.g. `_href`) and never export. */
export type Row = Record<string, string | number | null | undefined>;

export type ReportTable = {
  title: string;
  columns: Column[];
  rows: Row[];
  /** Keyed by column. Omit a key to leave that cell blank. */
  totals?: Row;
};

export const isNumeric = (t?: ColumnType) =>
  t === "int" || t === "qty" || t === "money" || t === "percent";
