"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { deletePurchase } from "./actions";
import { Button } from "@/components/ui/button";

export function PurchaseRowActions({
  id,
  purchaseNo,
  canManage = true,
  canReturn = true,
}: {
  id: number;
  purchaseNo: string;
  /** Viewing, editing/deleting, and returning are three permissions (§25.2). */
  canManage?: boolean;
  canReturn?: boolean;
}) {
  const router = useRouter();

  async function onDelete() {
    if (
      !confirm(
        `Delete purchase ${purchaseNo}? The stock it added will be removed again.`,
      )
    )
      return;
    const res = await deletePurchase(id);
    if (res.ok) toast.success("Purchase deleted — stock reversed");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label="View" asChild>
        <Link href={`/purchases/${id}`}>
          <Eye className="size-4" />
        </Link>
      </Button>
      {canReturn && (
        <Button variant="ghost" size="icon" aria-label="Return" asChild>
          <Link href={`/purchases/${id}/return`}>
            <Undo2 className="size-4" />
          </Link>
        </Button>
      )}
      {canManage && (
        <>
          <Button variant="ghost" size="icon" aria-label="Edit" asChild>
            <Link href={`/purchases/${id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </>
      )}
    </div>
  );
}
