"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePurchaseReturn } from "../purchases/[id]/return/actions";
import { Button } from "@/components/ui/button";

export function ReturnRowActions({ id, returnNo }: { id: number; returnNo: string }) {
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete return ${returnNo}? The goods go back into stock.`)) return;
    const res = await deletePurchaseReturn(id);
    if (res.ok) toast.success("Return deleted — stock restored");
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
