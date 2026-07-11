"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESETS, type DateRange } from "@/lib/reports/range";
import { cn } from "@/lib/utils";

/**
 * Presets for the common case, two date boxes for everything else.
 * The range lives in the URL, so a report stays linkable and refresh-safe.
 */
export function RangePicker({ range }: { range: DateRange }) {
  return (
    // Re-key on the active range so the two date boxes always show the range the
    // report is actually displaying. Without this, clicking a preset moves the
    // report but leaves stale dates in the inputs — and the next Apply silently
    // navigates back to them.
    <RangeInputs key={`${range.fromStr}:${range.toStr}`} range={range} />
  );
}

function RangeInputs({ range }: { range: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [from, setFrom] = useState(range.fromStr);
  const [to, setTo] = useState(range.toStr);

  /** Keep every other filter (groupBy, status, …) — only the range changes. */
  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            type="button"
            size="sm"
            variant={range.preset === p.value ? "default" : "outline"}
            onClick={() => go({ preset: p.value, from: null, to: null })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div
        className={cn(
          "flex items-end gap-1 rounded-md border p-1",
          range.preset === "custom" && "border-primary",
        )}
      >
        <Input
          type="date"
          aria-label="From date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="h-8 w-[9.5rem] border-0 shadow-none focus-visible:ring-0"
        />
        <span className="pb-2 text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To date"
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 w-[9.5rem] border-0 shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          onClick={() => go({ from, to, preset: null })}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
