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

type Unit = {
  id: number;
  name: string;
  shortName: string | null;
  allowDecimal: boolean;
};

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

      {/* The whole point of the unit master (BLUEPRINT §21). A piece cannot be cut
          in half; 2.5 metres of fabric is ordinary. */}
      <div className="rounded-lg border p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="allowDecimal"
            defaultChecked={unit?.allowDecimal ?? false}
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">Allow fractional quantities</span>
            <span className="block text-xs text-muted-foreground">
              Tick this for units that can be split — metres, litres, kilograms. Leave it
              off for anything counted one at a time: half a shirt cannot be sold,
              returned or counted.
            </span>
          </span>
        </label>
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
