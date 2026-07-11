"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveCustomer, deleteCustomer, type ActionState } from "./actions";
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

export type CustomerGroupOption = { id: number; name: string; discount: number };

export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  businessName: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  customerGroupId: number | null;
  openingBalance: number;
  loyaltyPoints: number;
  isWalkIn: boolean;
};

function CustomerForm({
  customer,
  groups,
  onDone,
}: {
  customer?: Customer;
  groups: CustomerGroupOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCustomer.bind(null, customer?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(customer ? "Customer updated" : "Customer added");
      onDone();
    }
  }, [state, customer, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={customer?.phone ?? ""}
            placeholder="01700000000"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={customer?.name ?? ""}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerGroupId">Group</Label>
          <select
            id="customerGroupId"
            name="customerGroupId"
            defaultValue={customer?.customerGroupId ?? "none"}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="none">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} — {g.discount}% off
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={customer?.businessName ?? ""}
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
            defaultValue={customer?.openingBalance ?? 0}
          />
          <p className="text-xs text-muted-foreground">What they already owe you.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="loyaltyPoints">Loyalty points</Label>
          <Input
            id="loyaltyPoints"
            name="loyaltyPoints"
            type="number"
            min="0"
            defaultValue={customer?.loyaltyPoints ?? 0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" name="note" defaultValue={customer?.note ?? ""} rows={2} />
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

export function AddCustomerButton({ groups }: { groups: CustomerGroupOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>
        <CustomerForm groups={groups} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function CustomerRowActions({
  customer,
  groups,
}: {
  customer: Customer;
  groups: CustomerGroupOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete customer "${customer.name}"?`)) return;
    const res = await deleteCustomer(customer.id);
    if (res.ok) toast.success("Customer deleted");
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
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <CustomerForm customer={customer} groups={groups} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete"
        disabled={customer.isWalkIn}
        onClick={onDelete}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
