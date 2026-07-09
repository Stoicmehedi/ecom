"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isUniqueError } from "@/lib/db-error";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const variantSchema = z.object({
  id: z.number().int().optional(),
  sku: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
  label: z.string().trim().max(100).optional(),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  wholesalePrice: z.number().min(0).nullable().optional(),
  openingStock: z.number().min(0).optional(),
});

const productSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Product name is required").max(150),
  type: z.enum(["SIMPLE", "VARIABLE"]),
  categoryId: z.number().int().nullable().optional(),
  brandId: z.number().int().nullable().optional(),
  unitId: z.number().int().nullable().optional(),
  imageUrl: z.string().trim().url("Image must be a valid URL").nullable().optional(),
  isActive: z.boolean().default(true),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
});

export type ProductInput = z.input<typeof productSchema>;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "item"
  );
}

function genSku(name: string): string {
  return `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

export async function saveProduct(input: ProductInput): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const p = parsed.data;

  // SIMPLE products have exactly one variant.
  const variants = p.type === "SIMPLE" ? p.variants.slice(0, 1) : p.variants;

  const productData = {
    name: p.name,
    type: p.type,
    categoryId: p.categoryId ?? null,
    brandId: p.brandId ?? null,
    unitId: p.unitId ?? null,
    imageUrl: p.imageUrl || null,
    isActive: p.isActive,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      let productId = p.id;

      if (productId) {
        await tx.product.update({ where: { id: productId }, data: productData });
      } else {
        const created = await tx.product.create({ data: productData });
        productId = created.id;
      }

      for (const v of variants) {
        const sku = v.sku?.trim() || genSku(p.name);
        const barcode = v.barcode?.trim() || null;
        const base = {
          sku,
          barcode,
          label: v.label?.trim() || null,
          purchasePrice: v.purchasePrice,
          sellingPrice: v.sellingPrice,
          wholesalePrice: v.wholesalePrice ?? null,
        };

        if (v.id) {
          await tx.productVariant.update({ where: { id: v.id }, data: base });
        } else {
          const opening = v.openingStock ?? 0;
          const variant = await tx.productVariant.create({
            data: { ...base, productId: productId!, stockQty: opening },
          });
          if (opening > 0) {
            await tx.stockMovement.create({
              data: {
                variantId: variant.id,
                type: "ADJUSTMENT",
                qty: opening,
                refType: "opening",
                note: "Opening stock",
              },
            });
          }
        }
      }

      return productId!;
    });

    revalidatePath("/products");
    return { ok: true, id: result };
  } catch (e) {
    if (isUniqueError(e)) {
      return { error: "A SKU or barcode is already in use. Please change it." };
    }
    return { error: "Something went wrong saving the product." };
  }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const inUse =
    (await prisma.saleItem.count({ where: { variant: { productId: id } } })) +
    (await prisma.purchaseItem.count({ where: { variant: { productId: id } } }));
  if (inUse > 0) {
    return { error: "Cannot delete: this product has sales or purchase history." };
  }
  try {
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { variant: { productId: id } } }),
      prisma.productVariant.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
  } catch {
    return { error: "Failed to delete product." };
  }
  revalidatePath("/products");
  return { ok: true };
}
