"use client";

import { selectId } from "@/lib/select";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { quickCreateCategory } from "../categories/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Cat = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
};

function AddCatDialog({
  label,
  parentId,
  disabled,
  onCreated,
}: {
  label: string;
  parentId: number | null;
  disabled?: boolean;
  onCreated: (c: Cat) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!name.trim() || pending) return;
    setPending(true);
    const res = await quickCreateCategory(name.trim(), parentId);
    setPending(false);
    if (res.ok && res.category) {
      toast.success(`${label} added`);
      onCreated(res.category);
      setName("");
      setOpen(false);
    } else {
      toast.error(res.error ?? "Failed to add");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={`Add ${label}`}
        >
          <Plus className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="quick-cat">Name</Label>
          <Input
            id="quick-cat"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`New ${label.toLowerCase()}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryCascade({
  categories,
  value,
  onChange,
}: {
  categories: Cat[];
  value: number | null;
  onChange: (leafId: number | null) => void;
}) {
  const [cats, setCats] = useState<Cat[]>(categories);
  const [catId, setCatId] = useState<number | null>(null);
  const [subId, setSubId] = useState<number | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const initialized = useRef(false);

  // Seed the three selects from an existing leaf category (edit mode).
  useEffect(() => {
    if (initialized.current || value == null) return;
    initialized.current = true;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const leaf = byId.get(value);
    if (!leaf) return;
    if (leaf.level === 1) {
      setCatId(leaf.id);
    } else if (leaf.level === 2) {
      setSubId(leaf.id);
      setCatId(leaf.parentId);
    } else {
      setChildId(leaf.id);
      const sub = leaf.parentId ? byId.get(leaf.parentId) : undefined;
      setSubId(sub?.id ?? null);
      setCatId(sub?.parentId ?? null);
    }
  }, [value, categories]);

  const leaf = childId ?? subId ?? catId;
  useEffect(() => {
    onChange(leaf);
  }, [leaf, onChange]);

  const level1 = useMemo(() => cats.filter((c) => c.level === 1), [cats]);
  const subs = useMemo(
    () => cats.filter((c) => c.level === 2 && c.parentId === catId),
    [cats, catId],
  );
  const children = useMemo(
    () => cats.filter((c) => c.level === 3 && c.parentId === subId),
    [cats, subId],
  );

  const sel = (id: number | null) => (id == null ? "none" : String(id));


  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
      {/* Category */}
      <div className="space-y-2">
        <Label>Category</Label>
        <div className="flex gap-2">
          <Select
            value={sel(catId)}
            onValueChange={(v) => {
              const id = selectId(v);
              if (id === undefined) return;
              setCatId(id);
              setSubId(null);
              setChildId(null);
            }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {level1.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddCatDialog
            label="Category"
            parentId={null}
            onCreated={(c) => {
              setCats((p) => [...p, c]);
              setCatId(c.id);
              setSubId(null);
              setChildId(null);
            }}
          />
        </div>
      </div>

      {/* Sub-category */}
      <div className="space-y-2">
        <Label>Sub-category</Label>
        <div className="flex gap-2">
          <Select
            value={sel(subId)}
            disabled={catId == null}
            onValueChange={(v) => {
              const id = selectId(v);
              if (id === undefined) return;
              setSubId(id);
              setChildId(null);
            }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={catId == null ? "Pick a category" : "None"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {subs.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddCatDialog
            label="Sub-category"
            parentId={catId}
            disabled={catId == null}
            onCreated={(c) => {
              setCats((p) => [...p, c]);
              setSubId(c.id);
              setChildId(null);
            }}
          />
        </div>
      </div>

      {/* Child */}
      <div className="space-y-2">
        <Label>Child</Label>
        <div className="flex gap-2">
          <Select
            value={sel(childId)}
            disabled={subId == null}
            onValueChange={(v) => {
              const id = selectId(v);
              if (id !== undefined) setChildId(id);
            }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue
                placeholder={subId == null ? "Pick a sub-category" : "None"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {children.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddCatDialog
            label="Child category"
            parentId={subId}
            disabled={subId == null}
            onCreated={(c) => {
              setCats((p) => [...p, c]);
              setChildId(c.id);
            }}
          />
        </div>
      </div>
    </div>
  );
}
