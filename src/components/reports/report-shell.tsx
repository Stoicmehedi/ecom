import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { RangePicker } from "./range-picker";
import { ExportButtons } from "./export-buttons";
import type { DateRange } from "@/lib/reports/range";
import { cn } from "@/lib/utils";

export type ReportTab = { label: string; href: string; key: string };

/** The profit tabs only appear for someone allowed to see cost. */
export function reportTabs(canSeeProfit: boolean): ReportTab[] {
  const tabs: ReportTab[] = [
    { key: "overview", label: "Overview", href: "/reports" },
    { key: "sales", label: "Sales", href: "/reports/sales" },
  ];
  if (canSeeProfit) {
    tabs.push(
      { key: "profit-loss", label: "Profit & Loss", href: "/reports/profit-loss" },
      { key: "products", label: "Product profit", href: "/reports/products" },
    );
  }
  tabs.push({ key: "dues", label: "Dues", href: "/reports/dues" });
  return tabs;
}

/**
 * Shared chrome for every report: the tab strip, the range, the exports, and
 * the print rules that strip the app down to just the report.
 */
export function ReportShell({
  title,
  description,
  active,
  tabs,
  range,
  exportKey,
  toolbar,
  children,
}: {
  title: string;
  description?: string;
  active: string;
  tabs: ReportTab[];
  /** Omitted for reports that are a snapshot of now (Dues). */
  range?: DateRange;
  /** The `/api/reports/<key>/export` slug. Omit for the overview. */
  exportKey?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="report-root mx-auto w-full max-w-7xl space-y-6">
      {/* Printing yields the report itself — not the sidebar, not the buttons. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .report-root, .report-root * { visibility: visible !important; }
          .report-root {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: none; margin: 0; padding: 8mm;
          }
          .no-print { display: none !important; }
          .report-surface { border: none !important; }
          thead { display: table-header-group; }  /* repeat headers across pages */
          tr { break-inside: avoid; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <PageHeader title={title} description={description}>
        {exportKey && <ExportButtons report={exportKey} />}
      </PageHeader>

      <nav className="no-print flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              t.key === active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {(range || toolbar) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {range ? <RangePicker range={range} /> : <span />}
          {toolbar}
        </div>
      )}

      {range && (
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{range.label}</span>
        </p>
      )}

      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "muted";
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-primary",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
