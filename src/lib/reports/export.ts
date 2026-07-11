import ExcelJS from "exceljs";
import { isNumeric, type Column, type ReportTable, type Row } from "./types";

/** A date cell exports as a plain `YYYY-MM-DD` — sortable everywhere. */
function cellValue(row: Row, col: Column): string | number | null {
  const v = row[col.key];
  if (v == null || v === "") return col.type && isNumeric(col.type) ? null : "";
  if (col.type === "date") return String(v).slice(0, 10);
  if (isNumeric(col.type)) return Number(v);
  return String(v);
}

// ------------------------------------------------------------------- CSV

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: ReportTable): string {
  const cols = table.columns;
  const lines: string[] = [];
  lines.push(cols.map((c) => csvCell(c.label)).join(","));
  for (const row of table.rows) {
    lines.push(cols.map((c) => csvCell(cellValue(row, c))).join(","));
  }
  if (table.totals) {
    lines.push(
      cols
        .map((c, i) => {
          if (i === 0) return csvCell("Total");
          const v = table.totals![c.key];
          return v == null ? "" : csvCell(isNumeric(c.type) ? Number(v) : String(v));
        })
        .join(","),
    );
  }
  // A BOM so Excel opens UTF-8 names correctly instead of mangling them.
  return "﻿" + lines.join("\r\n");
}

// ----------------------------------------------------------------- Excel

const NUMBER_FORMAT: Record<string, string> = {
  money: "#,##0.00",
  qty: "#,##0.###",
  int: "#,##0",
  percent: '#,##0.00"%"',
};

export async function toXlsx(
  table: ReportTable,
  meta: { subtitle?: string } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MPoS";
  const ws = wb.addWorksheet(table.title.slice(0, 31) || "Report");

  const cols = table.columns;

  // Title block, so a printed/emailed sheet still says what it is.
  const titleRow = ws.addRow([table.title]);
  titleRow.font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, Math.max(cols.length, 1));
  if (meta.subtitle) {
    const sub = ws.addRow([meta.subtitle]);
    sub.font = { italic: true, color: { argb: "FF6B7280" } };
    ws.mergeCells(sub.number, 1, sub.number, Math.max(cols.length, 1));
  }
  ws.addRow([]);

  const header = ws.addRow(cols.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFECFDF5" }, // MPoS emerald, at rest
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });

  for (const row of table.rows) {
    const r = ws.addRow(cols.map((c) => cellValue(row, c)));
    r.eachCell((cell, i) => {
      const type = cols[i - 1]?.type;
      if (isNumeric(type)) {
        cell.numFmt = NUMBER_FORMAT[type!] ?? "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
    });
  }

  if (table.totals) {
    const values = cols.map((c, i) => {
      if (i === 0) return "Total";
      const v = table.totals![c.key];
      return v == null ? null : isNumeric(c.type) ? Number(v) : String(v);
    });
    const r = ws.addRow(values);
    r.font = { bold: true };
    r.eachCell((cell, i) => {
      const type = cols[i - 1]?.type;
      if (isNumeric(type)) {
        cell.numFmt = NUMBER_FORMAT[type!] ?? "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
      cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
    });
  }

  cols.forEach((c, i) => {
    const longest = table.rows.reduce(
      (w, row) => Math.max(w, String(cellValue(row, c) ?? "").length),
      c.label.length,
    );
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 40);
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** `sales-2026-07-11.csv` — dated, so downloads don't overwrite each other. */
export function exportFilename(base: string, ext: string, stamp: string): string {
  return `${base}-${stamp}.${ext}`;
}
