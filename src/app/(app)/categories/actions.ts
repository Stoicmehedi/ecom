"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isFkError } from "@/lib/db-error";
import { requirePermission } from "@/lib/guard";
import { logActivity } from "@/lib/activity";

export type ActionState = { ok?: boolean; error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  parentId: z.string().optional(),
});

export async function saveCategory(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await requirePermission("products.masters");
  if (denied) return { error: denied };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    parentId: formData.get("parentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const rawParent = parsed.data.parentId;
  const parentId =
    rawParent && rawParent !== "none" ? Number(rawParent) : null;

  if (parentId && id && parentId === id) {
    return { error: "A category cannot be its own parent." };
  }

  let level = 1;
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) return { error: "Selected parent no longer exists." };
    level = parent.level + 1;
    if (level > 3) return { error: "Categories can only be nested 3 levels deep." };
  }

  const data = { name: parsed.data.name, parentId, level };
  try {
    if (id) {
      await prisma.category.update({ where: { id }, data });
    } else {
      await prisma.category.create({ data });
    }
  } catch {
    return { error: "Something went wrong. Please try again." };
  }

  await logActivity(prisma, {
    module: "Category",
    action: id ? "Updated" : "Created",
    details: `Category '${parsed.data.name}' ${id ? "updated" : "created"}`,
  });

  revalidatePath("/categories");
  return { ok: true };
}

/**
 * Create a whole Category > Sub-category > Child branch in one go.
 * Each level is found-or-created under the previous, so re-entering an
 * existing name reuses it instead of duplicating.
 */
export async function createCategoryPath(
  catName: string,
  subName?: string,
  childName?: string,
): Promise<ActionState> {
  const denied = await requirePermission("products.masters");
  if (denied) return { error: denied };

  const cat = catName.trim();
  const sub = (subName ?? "").trim();
  const child = (childName ?? "").trim();

  if (!cat) return { error: "Category name is required." };
  if (child && !sub) return { error: "Add a sub-category before a child." };

  try {
    let category = await prisma.category.findFirst({
      where: { name: cat, level: 1, parentId: null },
    });
    if (!category) {
      category = await prisma.category.create({
        data: { name: cat, level: 1, parentId: null },
      });
    }

    if (sub) {
      let subCat = await prisma.category.findFirst({
        where: { name: sub, level: 2, parentId: category.id },
      });
      if (!subCat) {
        subCat = await prisma.category.create({
          data: { name: sub, level: 2, parentId: category.id },
        });
      }

      if (child) {
        const existingChild = await prisma.category.findFirst({
          where: { name: child, level: 3, parentId: subCat.id },
        });
        if (!existingChild) {
          await prisma.category.create({
            data: { name: child, level: 3, parentId: subCat.id },
          });
        }
      }
    }

    await logActivity(prisma, {
      module: "Category",
      action: "Created",
      details: `Category path '${[cat, sub, child].filter(Boolean).join(" > ")}' created`,
    });

    revalidatePath("/categories");
    return { ok: true };
  } catch {
    return { error: "Failed to create categories." };
  }
}

/** Rename one or more category levels (used by the single-row branch editor). */
export async function updateCategoryNames(
  items: { id: number; name: string }[],
): Promise<ActionState> {
  const denied = await requirePermission("products.masters");
  if (denied) return { error: denied };

  for (const it of items) {
    if (!it.name.trim()) return { error: "Names cannot be empty." };
  }
  try {
    await prisma.$transaction(
      items.map((it) =>
        prisma.category.update({
          where: { id: it.id },
          data: { name: it.name.trim() },
        }),
      ),
    );
  } catch {
    return { error: "Failed to update categories." };
  }

  await logActivity(prisma, {
    module: "Category",
    action: "Updated",
    details: `Category '${items.map((it) => it.name.trim()).join(", ")}' renamed`,
  });

  revalidatePath("/categories");
  return { ok: true };
}

export type QuickCategory = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
};

/** Create a category inline (e.g. from the product form) and return the new row. */
export async function quickCreateCategory(
  name: string,
  parentId: number | null,
): Promise<{ ok: boolean; error?: string; category?: QuickCategory }> {
  const denied = await requirePermission("products.masters");
  if (denied) return { ok: false, error: denied };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };

  let level = 1;
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) return { ok: false, error: "Parent no longer exists." };
    level = parent.level + 1;
    if (level > 3) return { ok: false, error: "Categories nest up to 3 levels." };
  }

  try {
    const c = await prisma.category.create({
      data: { name: trimmed, parentId, level },
    });
    await logActivity(prisma, {
      module: "Category",
      action: "Created",
      details: `Category '${c.name}' created`,
    });
    revalidatePath("/categories");
    return {
      ok: true,
      category: { id: c.id, name: c.name, level: c.level, parentId: c.parentId },
    };
  } catch {
    return { ok: false, error: "Failed to create category." };
  }
}

export async function deleteCategory(id: number): Promise<ActionState> {
  const denied = await requirePermission("products.masters");
  if (denied) return { error: denied };

  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    return { error: "Cannot delete: this category has sub-categories." };
  }
  const doomed = await prisma.category.findUnique({
    where: { id },
    select: { name: true },
  });
  try {
    await prisma.category.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this category is used by products." };
    return { error: "Failed to delete category." };
  }

  await logActivity(prisma, {
    module: "Category",
    action: "Deleted",
    details: `Category '${doomed?.name ?? ""}' deleted`,
  });

  revalidatePath("/categories");
  return { ok: true };
}
