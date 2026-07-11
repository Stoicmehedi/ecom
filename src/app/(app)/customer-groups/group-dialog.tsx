"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  saveCustomerGroup,
  deleteCustomerGroup,
  type ActionState,
} from "../customers/actions";
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

export type Group = { id: number; name: string; discount: number };

function GroupForm({ group, onDone }: { group?: Group; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCustomerGroup.bind(null, group?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(group ? "Group updated" : "Group created");
      onDone();
    }
  }, [state, group, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={group?.name}
          placeholder="e.g. Gold"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="discount">Default discount (%)</Label>
        <Input
          id="discount"
          name="discount"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={group?.discount ?? 0}
        />
        <p className="text-xs text-muted-foreground">
          Pre-filled on this customer&apos;s sales. The cashier can still override it.
        </p>
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

export function AddGroupButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Customer Group</DialogTitle>
        </DialogHeader>
        <GroupForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function GroupRowActions({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete group "${group.name}"?`)) return;
    const res = await deleteCustomerGroup(group.id);
    if (res.ok) toast.success("Group deleted");
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
            <DialogTitle>Edit Customer Group</DialogTitle>
          </DialogHeader>
          <GroupForm group={group} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
