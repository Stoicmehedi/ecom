"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  saveAttributeCategory,
  deleteAttributeCategory,
  saveAttribute,
  deleteAttribute,
  saveColor,
  deleteColor,
  type ActionState,
} from "./actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Axis = { id: number; name: string };
export type AttributeValue = {
  id: number;
  name: string;
  attributeCategoryId: number;
};
export type ColorRow = { id: number; name: string; hex: string | null };

// ------------------------------------------------------------------ the axis

function AxisForm({ axis, onDone }: { axis?: Axis; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAttributeCategory.bind(null, axis?.id ?? null),
    {},
  );
  useEffect(() => {
    if (state.ok) {
      toast.success(axis ? "Axis updated" : "Axis created");
      onDone();
    }
  }, [state, axis, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={axis?.name}
          placeholder="e.g. Size"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          An axis a product varies along — Size, Fit, Material.
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

export function AddAxisButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          Add axis
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add axis</DialogTitle>
        </DialogHeader>
        <AxisForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function AxisRowActions({ axis }: { axis: Axis }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete the "${axis.name}" axis and all its values?`)) return;
    const res = await deleteAttributeCategory(axis.id);
    if (res.ok) toast.success("Axis deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Edit axis">
            <Pencil className="size-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit axis</DialogTitle>
          </DialogHeader>
          <AxisForm axis={axis} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="icon" aria-label="Delete axis" onClick={onDelete}>
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  );
}

// --------------------------------------------------------------- axis values

function ValueForm({
  value,
  axes,
  defaultAxisId,
  onDone,
}: {
  value?: AttributeValue;
  axes: Axis[];
  defaultAxisId?: number;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAttribute.bind(null, value?.id ?? null),
    {},
  );
  const [axisId, setAxisId] = useState(
    String(value?.attributeCategoryId ?? defaultAxisId ?? axes[0]?.id ?? ""),
  );
  useEffect(() => {
    if (state.ok) {
      toast.success(value ? "Value updated" : "Value added");
      onDone();
    }
  }, [state, value, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="attributeCategoryId" value={axisId} />
      <div className="space-y-2">
        <Label>Axis</Label>
        <Select value={axisId} onValueChange={setAxisId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick an axis" />
          </SelectTrigger>
          <SelectContent>
            {axes.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="value-name">Value</Label>
        <Input
          id="value-name"
          name="name"
          defaultValue={value?.name}
          placeholder="e.g. 32"
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

export function AddValueButton({
  axes,
  defaultAxisId,
  label = "Add value",
}: {
  axes: Axis[];
  defaultAxisId?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (axes.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs">
          <Plus className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add value</DialogTitle>
        </DialogHeader>
        <ValueForm axes={axes} defaultAxisId={defaultAxisId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ValueChip({ value, axes }: { value: AttributeValue; axes: Axis[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await deleteAttribute(value.id);
    if (res.ok) toast.success("Value deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <>
      <span className="group inline-flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-2.5 pr-1 text-sm">
        <button
          type="button"
          className="font-medium hover:text-primary"
          onClick={() => setOpen(true)}
        >
          {value.name}
        </button>
        <button
          type="button"
          aria-label={`Delete ${value.name}`}
          onClick={onDelete}
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit value</DialogTitle>
          </DialogHeader>
          <ValueForm value={value} axes={axes} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------- colours

function ColorForm({ color, onDone }: { color?: ColorRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveColor.bind(null, color?.id ?? null),
    {},
  );
  const [hex, setHex] = useState(color?.hex ?? "");
  useEffect(() => {
    if (state.ok) {
      toast.success(color ? "Colour updated" : "Colour added");
      onDone();
    }
  }, [state, color, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="color-name">Name</Label>
        <Input
          id="color-name"
          name="name"
          defaultValue={color?.name}
          placeholder="e.g. Navy"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hex">Swatch (optional)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="hex"
            name="hex"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#1F3A93"
          />
          <span
            className="size-9 shrink-0 rounded-md border"
            style={{
              background: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)
                ? hex
                : "transparent",
            }}
          />
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

export function AddColorButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          Add colour
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add colour</DialogTitle>
        </DialogHeader>
        <ColorForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ColorChip({ color }: { color: ColorRow }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await deleteColor(color.id);
    if (res.ok) toast.success("Colour deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <>
      <span className="group inline-flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-sm">
        <span
          className="size-3.5 rounded-full border"
          style={{ background: color.hex ?? "transparent" }}
        />
        <button
          type="button"
          className="font-medium hover:text-primary"
          onClick={() => setOpen(true)}
        >
          {color.name}
        </button>
        <button
          type="button"
          aria-label={`Delete ${color.name}`}
          onClick={onDelete}
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit colour</DialogTitle>
          </DialogHeader>
          <ColorForm color={color} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
