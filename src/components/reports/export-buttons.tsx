"use client";

import { useSearchParams } from "next/navigation";
import { Download, Printer, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CSV and Excel hit the same endpoint the screen queried, with the same query
 * string — so an export is always exactly the table on screen.
 */
export function ExportButtons({ report }: { report: string }) {
  const params = useSearchParams();

  const href = (format: "csv" | "xlsx") => {
    const q = new URLSearchParams(params.toString());
    q.set("format", format);
    return `/api/reports/${report}/export?${q.toString()}`;
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
