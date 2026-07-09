"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isFkError } from "@/lib/db-error";

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
  revalidatePath("/categories");
  return { ok: true };
}

export async function deleteCategory(id: number): Promise<ActionState> {
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    return { error: "Cannot delete: this category has sub-categories." };
  }
  try {
    await prisma.category.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this category is used by products." };
    return { error: "Failed to delete category." };
  }
  revalidatePath("/categories");
  return { ok: true };
}
