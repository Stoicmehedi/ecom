"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveSupplier, deleteSupplier, type ActionState } from "./actions";
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
import { Textarea } from "@/components/ui/textarea";

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  businessName: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  openingBalance: number;
};

function SupplierForm({
  supplier,
  onDone,
}: {
  supplier?: Supplier;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveSupplier.bind(null, supplier?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(supplier ? "Supplier updated" : "Supplier added");
      onDone();
    }
  }, [state, supplier, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={supplier?.name}
            placeholder="Contact person"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={supplier?.phone ?? ""}
            placeholder="01700000000"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={supplier?.businessName ?? ""}
            placeholder="e.g. Zephyr Textiles Ltd."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="openingBalance">Opening due</Label>
          <Input
            id="openingBalance"
            name="openingBalance"
            type="number"
            step="0.01"
            min="0"
            defaultValue={supplier?.openingBalance ?? 0}
          />
          <p className="text-xs text-muted-foreground">
            What you already owe them.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            defaultValue={supplier?.address ?? ""}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" name="note" defaultValue={supplier?.note ?? ""} rows={2} />
        </div>
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

export function AddSupplierButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Supplier</DialogTitle>
        </DialogHeader>
        <SupplierForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function SupplierRowActions({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete supplier "${supplier.name}"?`)) return;
    const res = await deleteSupplier(supplier.id);
    if (res.ok) toast.success("Supplier deleted");
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <SupplierForm supplier={supplier} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
