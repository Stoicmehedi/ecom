"use server";

import { prisma } from "@/lib/prisma";
import { num } from "@/lib/format";

/**
 * A sellable variant, carrying everything the cart needs to price it the same
 * way the server will (BLUEPRINT §12.7a) — its own discount, its wholesale
 * break, and its product's floor.
 */
export type PosHit = {
  variantId: number;
  label: string;
  sku: string;
  barcode: string | null;
  price: number;
  stockQty: number;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
  wholesalePrice: number | null;
  wholesaleQty: number | null;
  minSalePrice: number | null;
};

const variantSelect = {
  product: { select: { name: true, minSalePrice: true } },
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
  product: { name: string; minSalePrice: unknown };
};

function toHit(v: VariantWithProduct): PosHit {
  return {
    variantId: v.id,
    label: v.label ? `${v.product.name} — ${v.label}` : v.product.name,
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
  };
}

/**
 * Find sellable variants by name, SKU, or barcode.
 *
 * `exact` is set when the term is an exact barcode/SKU match and nothing else
 * matched — the caller can then add it to the cart straight away, which is what
 * a barcode scan should feel like.
 */
export async function searchPos(
  q: string,
): Promise<{ hits: PosHit[]; exact: PosHit | null }> {
  const term = q.trim();
  if (!term) return { hits: [], exact: null };

  const scanned = await prisma.productVariant.findFirst({
    where: {
      OR: [{ barcode: term }, { sku: term }],
      product: { isActive: true },
    },
    include: variantSelect,
  });

  const variants = await prisma.productVariant.findMany({
    where: {
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { barcode: { contains: term, mode: "insensitive" } },
        { product: { name: { contains: term, mode: "insensitive" } } },
      ],
      product: { isActive: true },
    },
    take: 24,
    orderBy: [{ product: { sortIndex: "asc" } }, { sortIndex: "asc" }, { id: "asc" }],
    include: variantSelect,
  });

  return {
    hits: variants.map(toHit),
    exact: scanned ? toHit(scanned) : null,
  };
}

/** The tile grid shown before the cashier types anything. */
export async function browsePos(): Promise<PosHit[]> {
  const variants = await prisma.productVariant.findMany({
    where: { product: { isActive: true } },
    take: 24,
    orderBy: [{ product: { sortIndex: "asc" } }, { sortIndex: "asc" }, { id: "asc" }],
    include: variantSelect,
  });
  return variants.map(toHit);
}
