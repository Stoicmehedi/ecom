"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteProduct } from "./actions";

export function ProductRowActions({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete product "${name}"?`)) return;
    const res = await deleteProduct(id);
    if (res.ok) toast.success("Product deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="icon" aria-label="Edit">
        <Link href={`/products/${id}/edit`}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete"
        onClick={onDelete}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
