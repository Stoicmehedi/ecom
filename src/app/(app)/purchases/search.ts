"use server";

import { prisma } from "@/lib/prisma";
import { num } from "@/lib/format";

export type VariantHit = {
  variantId: number;
  label: string; // "Classic Tee — Red / L"
  sku: string;
  stockQty: number;
  purchasePrice: number;
  /** Whether a fraction of this can be bought — a shirt's cannot (BLUEPRINT §21). */
  allowDecimal: boolean;
};

/** Find variants by product name, SKU, or barcode — for the purchase line picker. */
export async function searchVariants(q: string): Promise<VariantHit[]> {
  const term = q.trim();
  if (!term) return [];

  const variants = await prisma.productVariant.findMany({
    where: {
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { barcode: { contains: term, mode: "insensitive" } },
        { product: { name: { contains: term, mode: "insensitive" } } },
      ],
      product: { isActive: true },
    },
    take: 20,
    orderBy: { id: "asc" },
    include: {
      product: { select: { name: true, unit: { select: { allowDecimal: true } } } },
    },
  });

  return variants.map((v) => ({
    variantId: v.id,
    label: v.label ? `${v.product.name} — ${v.label}` : v.product.name,
    sku: v.sku,
    stockQty: num(v.stockQty),
    purchasePrice: num(v.lastPurchasePrice ?? v.purchasePrice),
    allowDecimal: v.product.unit?.allowDecimal ?? false,
  }));
}
