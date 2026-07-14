"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { copyImage, deleteImage, isValidKey } from "@/lib/storage";
import { checkQtyLines } from "@/lib/qty";
import { revalidatePath } from "next/cache";
import { isUniqueError } from "@/lib/db-error";
import { makeEan13, isValidEan13 } from "@/lib/barcode";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/guard";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const variantSchema = z.object({
  id: z.number().int().optional(),
  sku: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
  label: z.string().trim().max(100).optional(),
  attributeId: z.number().int().nullable().optional(),
  colorId: z.number().int().nullable().optional(),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  wholesalePrice: z.number().min(0).nullable().optional(),
  wholesaleQty: z.number().min(0).nullable().optional(),
  discountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
  discountValue: z.number().min(0).default(0),
  openingStock: z.number().min(0).optional(),
});

const productSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Product name is required").max(150),
  code: z.string().trim().max(64).optional(),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(["SIMPLE", "VARIABLE"]),
  categoryId: z.number().int().nullable().optional(),
  brandId: z.number().int().nullable().optional(),
  unitId: z.number().int().nullable().optional(),
  // An uploaded photo's storage key (§28) — not a URL. The upload action minted it and
  // already proved the bytes are an image; here we only check it is a key we wrote.
  imageKey: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((k) => !k || isValidKey(k), "That is not an image we stored."),
  isActive: z.boolean().default(true),
  alertQty: z.number().min(0).nullable().optional(),
  minSalePrice: z.number().min(0).nullable().optional(),
  attributeCategoryId: z.number().int().nullable().optional(),
  attributeIds: z.array(z.number().int()).default([]),
  colorIds: z.array(z.number().int()).default([]),
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

function genSku(name: string, suffix?: string): string {
  const tail = suffix ? slugify(suffix) : Math.random().toString(36).slice(2, 7);
  return `${slugify(name)}-${tail}`.toUpperCase().slice(0, 64);
}

/**
 * Give a variant a scannable barcode if it hasn't got one. Derived from its id,
 * so it is stable and unique by construction; the salt loop is a belt-and-braces
 * retry in case a code was typed in by hand that happens to collide.
 */
async function ensureBarcode(tx: Prisma.TransactionClient, variantId: number) {
  const v = await tx.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { barcode: true },
  });
  if (v.barcode) return;

  for (let salt = 0; salt < 5; salt++) {
    const code = makeEan13(variantId, salt);
    const taken = await tx.productVariant.findFirst({
      where: { barcode: code },
      select: { id: true },
    });
    if (!taken) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { barcode: code },
      });
      return;
    }
  }
  // Five collisions is impossible in practice; leaving it blank beats throwing.
}

/** Which of the picked references does not exist, if any. */
async function missingRef(p: {
  categoryId?: number | null;
  brandId?: number | null;
  unitId?: number | null;
}): Promise<string | null> {
  if (p.categoryId && !(await prisma.category.count({ where: { id: p.categoryId } }))) {
    return "That category no longer exists — pick it again.";
  }
  if (p.brandId && !(await prisma.brand.count({ where: { id: p.brandId } }))) {
    return "That brand no longer exists — pick it again.";
  }
  if (p.unitId && !(await prisma.unit.count({ where: { id: p.unitId } }))) {
    return "That unit no longer exists — pick it again.";
  }
  return null;
}

export async function saveProduct(input: ProductInput): Promise<ActionResult> {
  const denied = await requirePermission("products.manage");
  if (denied) return { error: denied };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  // A SIMPLE product is exactly one variant, and varies along nothing.
  const isSimple = p.type === "SIMPLE";
  const variants = isSimple ? p.variants.slice(0, 1) : p.variants;

  for (const v of variants) {
    if (v.barcode && !isValidEan13(v.barcode) && !/^\d{6,14}$/.test(v.barcode)) {
      return {
        error: `"${v.barcode}" isn't a usable barcode — leave it blank and we'll generate one.`,
      };
    }
  }

  // Opening stock is stock, so the whole-unit rule binds it too (§21). Checked
  // against the unit picked on THIS form, not the variants' — a new variant has
  // no row to read a unit from yet.
  const unit = p.unitId
    ? await prisma.unit.findUnique({
        where: { id: p.unitId },
        select: { name: true, allowDecimal: true },
      })
    : null;
  const badOpening = checkQtyLines(
    variants
      .filter((v) => (v.openingStock ?? 0) > 0)
      .map((v) => ({
        qty: v.openingStock ?? 0,
        unit,
        label: v.sku?.trim() || v.label || p.name,
      })),
  );
  if (badOpening) return { error: badOpening };

  // A category, brand or unit that does not exist can only arrive from a stale screen or a
  // forged payload — either way, say which one rather than letting it die on a foreign key
  // with "something went wrong" (§12.11: that message hid this bug for a week).
  const missing = await missingRef(p);
  if (missing) return { error: missing };

  const productData = {
    name: p.name,
    code: p.code || null,
    description: p.description || null,
    type: p.type,
    categoryId: p.categoryId ?? null,
    brandId: p.brandId ?? null,
    unitId: p.unitId ?? null,
    imageKey: p.imageKey || null,
    isActive: p.isActive,
    alertQty: p.alertQty ?? null,
    minSalePrice: p.minSalePrice ?? null,
    attributeCategoryId: isSimple ? null : (p.attributeCategoryId ?? null),
  };

  // The picture this product used to have, if it is being replaced or cleared. Read before
  // the write, deleted after it lands — a replaced image whose file stayed would be a disk
  // that only grows (§28.2).
  const previousImage = p.id
    ? (await prisma.product.findUnique({ where: { id: p.id }, select: { imageKey: true } }))
        ?.imageKey ?? null
    : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      let productId = p.id;

      const axes = {
        attributes: {
          set: isSimple ? [] : p.attributeIds.map((id) => ({ id })),
        },
        colors: { set: isSimple ? [] : p.colorIds.map((id) => ({ id })) },
      };

      if (productId) {
        await tx.product.update({
          where: { id: productId },
          data: { ...productData, ...axes },
        });
      } else {
        const created = await tx.product.create({
          data: {
            ...productData,
            attributes: { connect: axes.attributes.set },
            colors: { connect: axes.colors.set },
          },
        });
        productId = created.id;
      }

      // ---- Reconcile: a variant the form no longer carries has been removed.
      // Removing one that has already been bought or sold would strand its
      // history, so that is refused rather than silently dropped.
      const keepIds = variants.map((v) => v.id).filter(Boolean) as number[];
      const existing = await tx.productVariant.findMany({
        where: { productId, id: { notIn: keepIds.length ? keepIds : [-1] } },
        select: { id: true, label: true, sku: true },
      });

      for (const gone of existing) {
        const used =
          (await tx.saleItem.count({ where: { variantId: gone.id } })) +
          (await tx.purchaseItem.count({ where: { variantId: gone.id } }));
        if (used > 0) {
          throw new VariantInUse(gone.label || gone.sku);
        }
      }
      if (existing.length > 0) {
        const ids = existing.map((e) => e.id);
        await tx.stockMovement.deleteMany({ where: { variantId: { in: ids } } });
        await tx.productVariant.deleteMany({ where: { id: { in: ids } } });
      }

      // ---- Upsert the variants the form does carry.
      let index = 0;
      for (const v of variants) {
        const base = {
          sku: v.sku?.trim() || genSku(p.name, v.label),
          barcode: v.barcode?.trim() || null,
          label: v.label?.trim() || null,
          attributeId: isSimple ? null : (v.attributeId ?? null),
          colorId: isSimple ? null : (v.colorId ?? null),
          purchasePrice: v.purchasePrice,
          sellingPrice: v.sellingPrice,
          wholesalePrice: v.wholesalePrice ?? null,
          wholesaleQty: v.wholesaleQty ?? null,
          discountType: v.discountType,
          discountValue: v.discountValue,
          sortIndex: index++,
        };

        if (v.id) {
          await tx.productVariant.update({ where: { id: v.id }, data: base });
          await ensureBarcode(tx, v.id);
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
          await ensureBarcode(tx, variant.id);
        }
      }

      return productId!;
    });

    // The row now points at the new picture (or at none), so the old file is unreferenced.
    if (previousImage && previousImage !== productData.imageKey) {
      await deleteImage(previousImage);
    }

    revalidatePath("/products");
    revalidatePath("/inventory");
    revalidatePath("/pos");
    return { ok: true, id: result };
  } catch (e) {
    if (e instanceof VariantInUse) {
      return {
        error: `Cannot remove the "${e.which}" variant — it already has sales or purchase history.`,
      };
    }
    if (isUniqueError(e)) {
      return { error: "A SKU or barcode is already in use. Please change it." };
    }
    return { error: "Something went wrong saving the product." };
  }
}

class VariantInUse extends Error {
  constructor(public which: string) {
    super("variant-in-use");
  }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const denied = await requirePermission("products.manage");
  if (denied) return { error: denied };

  const inUse =
    (await prisma.saleItem.count({ where: { variant: { productId: id } } })) +
    (await prisma.purchaseItem.count({ where: { variant: { productId: id } } }));
  if (inUse > 0) {
    return {
      error:
        "Cannot delete: this product has sales or purchase history. Disable it instead.",
    };
  }

  const doomed = await prisma.product.findUnique({
    where: { id },
    select: { imageKey: true },
  });

  try {
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { variant: { productId: id } } }),
      prisma.productVariant.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
  } catch {
    return { error: "Failed to delete product." };
  }

  // The row is gone, so nothing points at the file any more. Deleted last, on purpose:
  // an uploads directory that only grows is a disk that eventually fills (§28.2).
  await deleteImage(doomed?.imageKey);

  revalidatePath("/products");
  return { ok: true };
}

/**
 * Retire a product without deleting it. Delete is blocked once a product has
 * history — this is how you take it off the POS and keep the books intact.
 */
export async function setProductActive(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  const denied = await requirePermission("products.manage");
  if (denied) return { error: denied };

  try {
    await prisma.product.update({ where: { id }, data: { isActive } });
  } catch {
    return { error: "Failed to update the product." };
  }
  revalidatePath("/products");
  return { ok: true };
}

/** Copy a product and its variants — the fastest way to add the next near-identical one. */
export async function duplicateProduct(id: number): Promise<ActionResult> {
  const denied = await requirePermission("products.manage");
  if (denied) return { error: denied };

  const src = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { sortIndex: "asc" } },
      attributes: { select: { id: true } },
      colors: { select: { id: true } },
    },
  });
  if (!src) return { error: "Product not found." };

  try {
    const newId = await prisma.$transaction(async (tx) => {
      const copy = await tx.product.create({
        data: {
          name: `${src.name} (copy)`,
          code: null, // a code identifies one product; the copy needs its own
          description: src.description,
          type: src.type,
          // Its own copy of the picture — a shared key would mean deleting one
          // product takes the other's image with it (§28.2).
          imageKey: await copyImage(src.imageKey),
          isActive: src.isActive,
          alertQty: src.alertQty,
          minSalePrice: src.minSalePrice,
          categoryId: src.categoryId,
          brandId: src.brandId,
          unitId: src.unitId,
          branchId: src.branchId,
          attributeCategoryId: src.attributeCategoryId,
          attributes: { connect: src.attributes.map((a) => ({ id: a.id })) },
          colors: { connect: src.colors.map((c) => ({ id: c.id })) },
        },
      });

      for (const v of src.variants) {
        // The copy starts with no stock and its own SKU/barcode — carrying those
        // over would collide, and a copy has never been bought.
        const created = await tx.productVariant.create({
          data: {
            productId: copy.id,
            sku: genSku(copy.name, v.label ?? undefined),
            barcode: null,
            label: v.label,
            attributeId: v.attributeId,
            colorId: v.colorId,
            purchasePrice: v.purchasePrice,
            sellingPrice: v.sellingPrice,
            wholesalePrice: v.wholesalePrice,
            wholesaleQty: v.wholesaleQty,
            discountType: v.discountType,
            discountValue: v.discountValue,
            sortIndex: v.sortIndex,
            stockQty: 0,
          },
        });
        await ensureBarcode(tx, created.id);
      }
      return copy.id;
    });

    revalidatePath("/products");
    return { ok: true, id: newId };
  } catch (e) {
    if (isUniqueError(e)) return { error: "Copy collided with an existing SKU. Try again." };
    return { error: "Failed to duplicate the product." };
  }
}
