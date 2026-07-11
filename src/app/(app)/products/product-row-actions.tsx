"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Pencil,
  Trash2,
  Copy,
  EyeOff,
  Eye,
  MoreHorizontal,
  Barcode,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProduct, duplicateProduct, setProductActive } from "./actions";

export function ProductRowActions({
  id,
  name,
  isActive,
}: {
  id: number;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(done);
      else toast.error(res.error ?? "Something went wrong");
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="icon" aria-label="Edit">
        <Link href={`/products/${id}/edit`}>
          <Pencil className="size-4" />
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions" disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => run(() => duplicateProduct(id), `Copied "${name}"`)}
          >
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href={`/labels?productId=${id}`}>
              <Barcode className="size-4" />
              Print labels
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              run(
                () => setProductActive(id, !isActive),
                isActive ? `"${name}" disabled` : `"${name}" enabled`,
              )
            }
          >
            {isActive ? (
              <>
                <EyeOff className="size-4" />
                Disable
              </>
            ) : (
              <>
                <Eye className="size-4" />
                Enable
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (!confirm(`Delete product "${name}"?`)) return;
              run(() => deleteProduct(id), "Product deleted");
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
