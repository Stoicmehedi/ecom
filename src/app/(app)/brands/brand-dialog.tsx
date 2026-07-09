"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveBrand, deleteBrand, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Brand = { id: number; name: string };

function BrandForm({
  brand,
  onDone,
}: {
  brand?: Brand;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveBrand.bind(null, brand?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(brand ? "Brand updated" : "Brand created");
      onDone();
    }
  }, [state, brand, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={brand?.name}
          placeholder="e.g. Nike"
          autoFocus
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddBrandButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Brand
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Brand</DialogTitle>
        </DialogHeader>
        <BrandForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function BrandRowActions({ brand }: { brand: Brand }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete brand "${brand.name}"?`)) return;
    const res = await deleteBrand(brand.id);
    if (res.ok) toast.success("Brand deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Edit">
            <Pencil className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
          </DialogHeader>
          <BrandForm brand={brand} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
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
