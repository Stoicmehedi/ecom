"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSaleReturn } from "../sales/[id]/return/actions";
import { Button } from "@/components/ui/button";

export function SaleReturnRowActions({
  id,
  returnNo,
}: {
  id: number;
  returnNo: string;
}) {
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete return ${returnNo}? The goods go back out of stock.`)) return;
    const res = await deleteSaleReturn(id);
    if (res.ok) toast.success("Return deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
