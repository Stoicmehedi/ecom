"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  createCategoryPath,
  updateCategoryNames,
  deleteCategory,
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
import { ComboInput } from "./combo-input";

export type Category = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
};

const eq = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Add a whole Category > Sub-category > Child branch at once. */
function AddPathForm({
  categories,
  onDone,
}: {
  categories: Category[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [child, setChild] = useState("");
  const [error, setError] = useState<string | null>(null);

  const names = (xs: Category[]) =>
    Array.from(new Set(xs.map((c) => c.name))).sort();

  // Names already under the typed parent come first; every other name at that
  // level is still offered, since reusing one under a new parent is normal.
  const level1 = categories.filter((c) => c.level === 1);
  const parentCat = level1.find((c) => eq(c.name, cat));
  const parentSub = categories.find(
    (c) => c.level === 2 && c.parentId === parentCat?.id && eq(c.name, sub),
  );

  const branchGroups = (level: number, parentId: number | undefined) => {
    const atLevel = categories.filter((c) => c.level === level);
    const mine = parentId ? atLevel.filter((c) => c.parentId === parentId) : [];
    const others = atLevel.filter((c) => c.parentId !== parentId);
    return [
      { label: "Already here", items: names(mine) },
      { label: "Reuse a name", items: names(others) },
    ];
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createCategoryPath(cat, sub, child);
      if (res.ok) {
        toast.success("Categories saved");
        onDone();
        router.refresh();
      } else {
        setError(res.error ?? "Failed to save");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cat">Category</Label>
        <ComboInput
          id="cat"
          value={cat}
          onChange={setCat}
          groups={[{ items: names(level1) }]}
          placeholder="e.g. Men's Wear"
          emptyHint="No match — this will be created as a new category."
          autoFocus
        />
      </div>

      <div className="flex items-start gap-2">
        <ChevronRight className="mt-9 size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <Label htmlFor="sub">Sub-category (optional)</Label>
          <ComboInput
            id="sub"
            value={sub}
            onChange={setSub}
            groups={branchGroups(2, parentCat?.id)}
            placeholder="e.g. Shirts"
            disabled={!cat.trim()}
            emptyHint="No match — this will be created as a new sub-category."
          />
        </div>
      </div>

      <div className="flex items-start gap-2 pl-6">
        <ChevronRight className="mt-9 size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <Label htmlFor="child">Child (optional)</Label>
          <ComboInput
            id="child"
            value={child}
            onChange={setChild}
            groups={branchGroups(3, parentSub?.id)}
            placeholder="e.g. Formal"
            disabled={!sub.trim()}
            emptyHint="No match — this will be created as a new child."
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Fill only Category for a top level, or add a Sub-category and Child to
        create the whole branch at once. Existing names are reused.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export type CategoryPath = {
  catId: number;
  cat: string;
  subId?: number;
  sub?: string;
  childId?: number;
  child?: string;
};

/** Rename the levels of a single branch (Category / Sub-category / Child). */
function PathEditForm({
  path,
  onDone,
}: {
  path: CategoryPath;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cat, setCat] = useState(path.cat);
  const [sub, setSub] = useState(path.sub ?? "");
  const [child, setChild] = useState(path.child ?? "");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items: { id: number; name: string }[] = [{ id: path.catId, name: cat }];
    if (path.subId) items.push({ id: path.subId, name: sub });
    if (path.childId) items.push({ id: path.childId, name: child });
    startTransition(async () => {
      const res = await updateCategoryNames(items);
      if (res.ok) {
        toast.success("Category updated");
        onDone();
        router.refresh();
      } else {
        setError(res.error ?? "Failed to update");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="e-cat">Category</Label>
        <Input
          id="e-cat"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          autoFocus
        />
      </div>
      {path.subId != null && (
        <div className="space-y-2">
          <Label htmlFor="e-sub">Sub-category</Label>
          <Input
            id="e-sub"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
          />
        </div>
      )}
      {path.childId != null && (
        <div className="space-y-2">
          <Label htmlFor="e-child">Child</Label>
          <Input
            id="e-child"
            value={child}
            onChange={(e) => setChild(e.target.value)}
          />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddCategoryButton({
  categories,
}: {
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Category</DialogTitle>
        </DialogHeader>
        <AddPathForm categories={categories} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function CategoryRowActions({ path }: { path: CategoryPath }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const leafId = path.childId ?? path.subId ?? path.catId;
  const leafName = path.child ?? path.sub ?? path.cat;

  async function onDelete() {
    if (!confirm(`Delete "${leafName}"?`)) return;
    const res = await deleteCategory(leafId);
    if (res.ok) toast.success("Category deleted");
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
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <PathEditForm path={path} onDone={() => setOpen(false)} />
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
