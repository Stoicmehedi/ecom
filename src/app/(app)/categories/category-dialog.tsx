"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveCategory, deleteCategory, type ActionState } from "./actions";
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

export type Category = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
};

/** Parents a category may attach to: anything at level 1 or 2 (so the child stays <= level 3). */
export type ParentOption = { id: number; name: string; level: number };

function CategoryForm({
  category,
  parentOptions,
  onDone,
}: {
  category?: Category;
  parentOptions: ParentOption[];
  onDone: () => void;
}) {
  const [parentId, setParentId] = useState<string>(
    category?.parentId ? String(category.parentId) : "none",
  );
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCategory.bind(null, category?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(category ? "Category updated" : "Category created");
      onDone();
    }
  }, [state, category, onDone]);

  // Can't parent under itself.
  const options = parentOptions.filter((p) => p.id !== category?.id);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="parentId" value={parentId} />
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={category?.name}
          placeholder="e.g. Men's Wear"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Parent category</Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger>
            <SelectValue placeholder="None (top level)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (top level)</SelectItem>
            {options.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {"— ".repeat(p.level - 1)}
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Leave as “None” for a top-level category. Up to 3 levels deep.
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

export function AddCategoryButton({
  parentOptions,
}: {
  parentOptions: ParentOption[];
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
        <CategoryForm parentOptions={parentOptions} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function CategoryRowActions({
  category,
  parentOptions,
}: {
  category: Category;
  parentOptions: ParentOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    const res = await deleteCategory(category.id);
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
          <CategoryForm
            category={category}
            parentOptions={parentOptions}
            onDone={() => setOpen(false)}
          />
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
