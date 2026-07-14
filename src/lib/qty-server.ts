import { prisma } from "@/lib/prisma";
import { checkQtyLines } from "@/lib/qty";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The server's side of the whole-unit rule (BLUEPRINT §21.2).
 *
 * Every write that moves stock passes its lines through here, whatever the
 * browser sent. The screens set a `step` so a fraction cannot be *typed*; this
 * is what stops one being *posted*. Kept apart from `qty.ts` because that file
 * is imported by client components and must stay free of Prisma.
 *
 * Returns an error message, or null.
 */
export async function checkVariantQtys(
  db: Db,
  lines: { variantId: number; qty: number }[],
): Promise<string | null> {
  if (lines.length === 0) return null;

  const variants = await db.productVariant.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.variantId))] } },
    select: {
      id: true,
      sku: true,
      product: {
        select: {
          name: true,
          unit: { select: { name: true, allowDecimal: true } },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  return checkQtyLines(
    lines.map((l) => {
      const v = byId.get(l.variantId);
      return {
        qty: l.qty,
        // A variant we cannot find gets the safe default (whole) rather than a
        // free pass; the caller's own "no such product" check will catch it.
        unit: v?.product.unit ?? null,
        label: v ? `${v.product.name} — ${v.sku}` : `#${l.variantId}`,
      };
    }),
  );
}
