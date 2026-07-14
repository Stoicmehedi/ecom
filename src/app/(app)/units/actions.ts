"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isFkError } from "@/lib/db-error";

export type ActionState = { ok?: boolean; error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  shortName: z.string().trim().max(20).optional().or(z.literal("")),
  // Whether a fraction of this unit is a real thing (BLUEPRINT §21). An unticked
  // box posts nothing at all, so absence means false — which is the safe default.
  allowDecimal: z.boolean().default(false),
});

export async function saveUnit(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    shortName: formData.get("shortName"),
    allowDecimal: formData.get("allowDecimal") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = {
    name: parsed.data.name,
    shortName: parsed.data.shortName || null,
    allowDecimal: parsed.data.allowDecimal,
  };
  try {
    if (id) {
      await prisma.unit.update({ where: { id }, data });
    } else {
      await prisma.unit.create({ data });
    }
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/units");
  return { ok: true };
}

export async function deleteUnit(id: number): Promise<ActionState> {
  try {
    await prisma.unit.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this unit is used by products." };
    return { error: "Failed to delete unit." };
  }
  revalidatePath("/units");
  return { ok: true };
}
