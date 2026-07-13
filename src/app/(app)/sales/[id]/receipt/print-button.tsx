"use client";

import Link from "next/link";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReceiptActions({ saleId }: { saleId: number }) {
  return (
    <div className="no-print flex flex-wrap justify-center gap-2">
      <Button variant="outline" asChild>
        <Link href="/pos">
          <ArrowLeft className="size-4" />
          Back to POS
        </Link>
      </Button>
      <Button onClick={() => window.print()}>
        <Printer className="size-4" />
        Print receipt
      </Button>
      {/* The A4 document is where PDF and sharing live (§20). */}
      <Button variant="outline" asChild>
        <Link href={`/sales/${saleId}/invoice`}>
          <FileText className="size-4" />
          A4 invoice · PDF · share
        </Link>
      </Button>
    </div>
  );
}
