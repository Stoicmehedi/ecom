"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isUniqueError, isFkError } from "@/lib/db-error";
import { requirePermission } from "@/lib/guard";

export type ActionState = { ok?: boolean; error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function saveBrand(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await requirePermission("products.masters");
  if (denied) return { error: denied };

  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  try {
    if (id) {
      await prisma.brand.update({ where: { id }, data: parsed.data });
    } else {
      await prisma.brand.create({ data: parsed.data });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "A brand with this name already exists." };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/brands");
  return { ok: true };
}

export async function deleteBrand(id: number): Promise<ActionState> {
  const denied = await requirePermission("products.masters");
  if (denied) return { error: denied };

  try {
    await prisma.brand.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this brand is used by products." };
    return { error: "Failed to delete brand." };
  }
  revalidatePath("/brands");
  return { ok: true };
}
