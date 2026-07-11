"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isUniqueError, isFkError } from "@/lib/db-error";

export type ActionState = { ok?: boolean; error?: string };

const nameSchema = z.string().trim().min(1, "Name is required").max(60);

// ------------------------------------------------- attribute categories (axes)

export async function saveAttributeCategory(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    if (id) {
      await prisma.attributeCategory.update({
        where: { id },
        data: { name: parsed.data },
      });
    } else {
      await prisma.attributeCategory.create({ data: { name: parsed.data } });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That axis already exists." };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/attributes");
  return { ok: true };
}

export async function deleteAttributeCategory(id: number): Promise<ActionState> {
  // Values cascade with the axis, so check the products first — silently
  // un-picking an axis from a product would strand its variants.
  const used = await prisma.product.count({ where: { attributeCategoryId: id } });
  if (used > 0) {
    return {
      error: `Cannot delete: ${used} product${used === 1 ? " uses" : "s use"} this axis.`,
    };
  }
  try {
    await prisma.attributeCategory.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this axis is in use." };
    return { error: "Failed to delete." };
  }
  revalidatePath("/attributes");
  return { ok: true };
}

// -------------------------------------------------------- attributes (values)

const attrSchema = z.object({
  name: nameSchema,
  attributeCategoryId: z.coerce.number().int().positive("Pick an axis"),
});

export async function saveAttribute(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = attrSchema.safeParse({
    name: formData.get("name"),
    attributeCategoryId: formData.get("attributeCategoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    if (id) {
      await prisma.attribute.update({ where: { id }, data: parsed.data });
    } else {
      await prisma.attribute.create({ data: parsed.data });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That value already exists on this axis." };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/attributes");
  return { ok: true };
}

export async function deleteAttribute(id: number): Promise<ActionState> {
  const used = await prisma.productVariant.count({ where: { attributeId: id } });
  if (used > 0) {
    return { error: `Cannot delete: ${used} variant(s) are this value.` };
  }
  try {
    await prisma.attribute.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this value is in use." };
    return { error: "Failed to delete." };
  }
  revalidatePath("/attributes");
  return { ok: true };
}

// ------------------------------------------------------------------- colours

const colorSchema = z.object({
  name: nameSchema,
  hex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour like #C0392B")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function saveColor(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = colorSchema.safeParse({
    name: formData.get("name"),
    hex: formData.get("hex"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = { name: parsed.data.name, hex: parsed.data.hex ?? null };
  try {
    if (id) {
      await prisma.color.update({ where: { id }, data });
    } else {
      await prisma.color.create({ data });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That colour already exists." };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/attributes");
  return { ok: true };
}

export async function deleteColor(id: number): Promise<ActionState> {
  const used = await prisma.productVariant.count({ where: { colorId: id } });
  if (used > 0) {
    return { error: `Cannot delete: ${used} variant(s) are this colour.` };
  }
  try {
    await prisma.color.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this colour is in use." };
    return { error: "Failed to delete." };
  }
  revalidatePath("/attributes");
  return { ok: true };
}
