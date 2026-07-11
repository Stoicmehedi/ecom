"use server";

import { prisma } from "@/lib/prisma";
import { num } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

/**
 * A sellable variant, carrying everything the cart needs to price it the same
 * way the server will (BLUEPRINT §12.7a) — its own discount, its wholesale
 * break, and its product's floor.
 */
export type PosHit = {
  variantId: number;
  /** "Field Tee — S / Navy" — what the cart line shows. */
  label: string;
  /** "S / Navy" — what the picker shows, with the product name already above it. */
  variantLabel: string | null;
  sku: string;
  barcode: string | null;
  price: number;
  stockQty: number;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
  wholesalePrice: number | null;
  wholesaleQty: number | null;
  minSalePrice: number | null;
  /** The axes this variant sits on, so the picker can lay out size × colour. */
  attribute: string | null;
  color: string | null;
  colorHex: string | null;
};

/**
 * The unit the grid shows. A shop with six sizes in four colours has ONE tile
 * here, not twenty-four — the variants are chosen after the product is picked.
 */
export type PosProduct = {
  productId: number;
  name: string;
  variants: PosHit[];
  /** Summed across variants — what "in stock" means for the product as a whole. */
  stockQty: number;
  minPrice: number;
  maxPrice: number;
};

const variantSelect = {
  product: { select: { id: true, name: true, minSalePrice: true } },
  attribute: { select: { name: true } },
  color: { select: { name: true, hex: true } },
} as const;

type VariantWithProduct = {
  id: number;
  sku: string;
  barcode: string | null;
  label: string | null;
  sellingPrice: unknown;
  stockQty: unknown;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: unknown;
  wholesalePrice: unknown;
  wholesaleQty: unknown;
  product: { id: number; name: string; minSalePrice: unknown };
  attribute: { name: string } | null;
  color: { name: string; hex: string | null } | null;
};

function toHit(v: VariantWithProduct): PosHit {
  return {
    variantId: v.id,
    label: v.label ? `${v.product.name} — ${v.label}` : v.product.name,
    variantLabel: v.label,
    sku: v.sku,
    barcode: v.barcode,
    price: num(v.sellingPrice as number),
    stockQty: num(v.stockQty as number),
    discountType: v.discountType,
    discountValue: num(v.discountValue as number),
    wholesalePrice: v.wholesalePrice == null ? null : num(v.wholesalePrice as number),
    wholesaleQty: v.wholesaleQty == null ? null : num(v.wholesaleQty as number),
    minSalePrice:
      v.product.minSalePrice == null ? null : num(v.product.minSalePrice as number),
    attribute: v.attribute?.name ?? null,
    color: v.color?.name ?? null,
    colorHex: v.color?.hex ?? null,
  };
}

/** Fold a flat variant list into one entry per product, order preserved. */
function group(variants: VariantWithProduct[]): PosProduct[] {
  const byProduct = new Map<number, PosProduct>();
  for (const v of variants) {
    const hit = toHit(v);
    const found = byProduct.get(v.product.id);
    if (found) {
      found.variants.push(hit);
      found.stockQty += hit.stockQty;
      found.minPrice = Math.min(found.minPrice, hit.price);
      found.maxPrice = Math.max(found.maxPrice, hit.price);
      continue;
    }
    byProduct.set(v.product.id, {
      productId: v.product.id,
      name: v.product.name,
      variants: [hit],
      stockQty: hit.stockQty,
      minPrice: hit.price,
      maxPrice: hit.price,
    });
  }
  return [...byProduct.values()];
}

/** Variants arrive grouped by product and in their intended order, so `group()` can fold them in one pass. */
const listOrder = [
  { product: { sortIndex: "asc" } },
  { productId: "asc" },
  { sortIndex: "asc" },
  { id: "asc" },
] satisfies Prisma.ProductVariantOrderByWithRelationInput[];

/**
 * Find sellable products by name, SKU, or barcode.
 *
 * `exact` is set when the term is an exact barcode/SKU match — it names one
 * variant and nothing else, so the caller adds it to the cart without opening
 * the picker. That is what a barcode scan has to feel like: the fast path must
 * not get slower to make the browse path better.
 */
export async function searchPos(
  q: string,
): Promise<{ products: PosProduct[]; exact: PosHit | null }> {
  const term = q.trim();
  if (!term) return { products: [], exact: null };

  const [scanned, variants] = await Promise.all([
    prisma.productVariant.findFirst({
      where: { OR: [{ barcode: term }, { sku: term }], product: { isActive: true } },
      include: variantSelect,
    }),
    prisma.productVariant.findMany({
      where: {
        product: {
          isActive: true,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { code: { contains: term, mode: "insensitive" } },
            // A SKU or barcode fragment pulls up the whole product, not the one
            // variant — the cashier still gets to see the sizes next to it.
            { variants: { some: { sku: { contains: term, mode: "insensitive" } } } },
            { variants: { some: { barcode: { contains: term, mode: "insensitive" } } } },
          ],
        },
      },
      take: 200,
      orderBy: listOrder,
      include: variantSelect,
    }),
  ]);

  return { products: group(variants), exact: scanned ? toHit(scanned) : null };
}

/** The tile grid shown before the cashier types anything. */
export async function browsePos(): Promise<PosProduct[]> {
  const variants = await prisma.productVariant.findMany({
    where: { product: { isActive: true } },
    take: 200,
    orderBy: listOrder,
    include: variantSelect,
  });
  return group(variants);
}
