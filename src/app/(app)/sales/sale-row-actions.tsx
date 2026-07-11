"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Printer, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSale } from "./actions";
import { Button } from "@/components/ui/button";

export function SaleRowActions({ id, invoiceNo }: { id: number; invoiceNo: string }) {
  const router = useRouter();

  async function onDelete() {
    if (
      !confirm(
        `Delete sale ${invoiceNo}? The stock goes back on the shelf and the payment is reversed.`,
      )
    )
      return;
    const res = await deleteSale(id);
    if (res.ok) toast.success("Sale deleted — stock restored");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label="View" asChild>
        <Link href={`/sales/${id}`}>
          <Eye className="size-4" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Return" asChild>
        <Link href={`/sales/${id}/return`}>
          <Undo2 className="size-4" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Receipt" asChild>
        <Link href={`/sales/${id}/receipt`}>
          <Printer className="size-4" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
