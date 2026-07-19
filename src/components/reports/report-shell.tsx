import { PageHeader } from "@/components/app/page-header";
import { TabStrip } from "@/components/app/tab-strip";
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

      <PageHeader eyebrow="Reports" title={title} description={description}>
        {exportKey && <ExportButtons report={exportKey} />}
      </PageHeader>

      <TabStrip
        tabs={tabs.map((t) => ({
          label: t.label,
          href: t.href,
          active: t.key === active,
        }))}
      />

      {(range || toolbar) && (
        // min-w-0 so the picker inside may shrink: a flex child defaults to
        // min-width:auto and will otherwise push the whole page wider than the
        // phone it is on.
        <div className="flex flex-wrap items-center justify-between gap-3">
          {range ? (
            <div className="min-w-0">
              <RangePicker range={range} />
            </div>
          ) : (
            <span />
          )}
          {toolbar && <div className="min-w-0">{toolbar}</div>}
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
    <div className="rounded-lg border border-border/70 bg-card px-3.5 py-3 shadow-xs">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "good" && "text-primary",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
