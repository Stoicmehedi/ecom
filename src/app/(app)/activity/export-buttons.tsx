"use client";

import { useSearchParams } from "next/navigation";
import { Download, Printer, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CSV and Excel hit the export endpoint with the SAME query string the screen used,
 * so a download is exactly the filtered log on screen. Print uses the browser (§29.3).
 */
export function ActivityExportButtons() {
  const params = useSearchParams();

  const href = (format: "csv" | "xlsx") => {
    const q = new URLSearchParams(params.toString());
    q.set("format", format);
    return `/api/activity/export?${q.toString()}`;
  };

  return (
    <div className="no-print flex gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href={href("csv")} download>
          <Download className="size-4" />
          CSV
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={href("xlsx")} download>
          <Sheet className="size-4" />
          Excel
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Print
      </Button>
    </div>
  );
}
