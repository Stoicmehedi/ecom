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

export type Category = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
};

export type CategorySuggestions = {
  categories: string[];
  subs: string[];
  children: string[];
};

/** Add a whole Category > Sub-category > Child branch at once. */
function AddPathForm({
  suggestions,
  onDone,
}: {
  suggestions: CategorySuggestions;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [child, setChild] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        <Input
          id="cat"
          list="cat-list"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          placeholder="e.g. Men's Wear"
          autoFocus
        />
        <datalist id="cat-list">
          {suggestions.categories.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div className="flex items-start gap-2">
        <ChevronRight className="mt-9 size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <Label htmlFor="sub">Sub-category (optional)</Label>
          <Input
            id="sub"
            list="sub-list"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            placeholder="e.g. Shirts"
          />
          <datalist id="sub-list">
            {suggestions.subs.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex items-start gap-2 pl-6">
        <ChevronRight className="mt-9 size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <Label htmlFor="child">Child (optional)</Label>
          <Input
            id="child"
            list="child-list"
            value={child}
            onChange={(e) => setChild(e.target.value)}
            placeholder="e.g. Formal"
            disabled={!sub.trim()}
          />
          <datalist id="child-list">
            {suggestions.children.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
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
  suggestions,
}: {
  suggestions: CategorySuggestions;
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
        <AddPathForm suggestions={suggestions} onDone={() => setOpen(false)} />
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
