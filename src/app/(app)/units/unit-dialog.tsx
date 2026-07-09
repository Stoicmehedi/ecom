"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveUnit, deleteUnit, type ActionState } from "./actions";
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

type Unit = { id: number; name: string; shortName: string | null };

function UnitForm({ unit, onDone }: { unit?: Unit; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveUnit.bind(null, unit?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(unit ? "Unit updated" : "Unit created");
      onDone();
    }
  }, [state, unit, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={unit?.name}
          placeholder="e.g. Piece"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shortName">Short name (optional)</Label>
        <Input
          id="shortName"
          name="shortName"
          defaultValue={unit?.shortName ?? ""}
          placeholder="e.g. pc"
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

export function AddUnitButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Unit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Unit</DialogTitle>
        </DialogHeader>
        <UnitForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function UnitRowActions({ unit }: { unit: Unit }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete unit "${unit.name}"?`)) return;
    const res = await deleteUnit(unit.id);
    if (res.ok) toast.success("Unit deleted");
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
            <DialogTitle>Edit Unit</DialogTitle>
          </DialogHeader>
          <UnitForm unit={unit} onDone={() => setOpen(false)} />
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
