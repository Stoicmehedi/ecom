"use server";

import { prisma } from "@/lib/prisma";
import { num } from "@/lib/format";

export type PosHit = {
  variantId: number;
  label: string;
  sku: string;
  barcode: string | null;
  price: number;
  stockQty: number;
};

function toHit(v: {
  id: number;
  sku: string;
  barcode: string | null;
  label: string | null;
  sellingPrice: unknown;
  stockQty: unknown;
  product: { name: string };
}): PosHit {
  return {
    variantId: v.id,
    label: v.label ? `${v.product.name} — ${v.label}` : v.product.name,
    sku: v.sku,
    barcode: v.barcode,
    price: num(v.sellingPrice as number),
    stockQty: num(v.stockQty as number),
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
    include: { product: { select: { name: true } } },
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
    orderBy: { id: "asc" },
    include: { product: { select: { name: true } } },
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
    orderBy: { id: "asc" },
    include: { product: { select: { name: true } } },
  });
  return variants.map(toHit);
}
