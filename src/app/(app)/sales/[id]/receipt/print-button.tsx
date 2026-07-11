"use client";

import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReceiptActions() {
  return (
    <div className="no-print flex justify-center gap-2">
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
    </div>
  );
}
