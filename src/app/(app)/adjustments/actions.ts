"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkVariantQtys } from "@/lib/qty-server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { round2, round3 } from "@/lib/costing";
import { postStockLossExpense } from "@/lib/expenses";
import type { Prisma } from "@/generated/prisma/client";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

type Tx = Prisma.TransactionClient;

/**
 * Admin-only (BLUEPRINT §19.7). An adjustment silently destroys stock and books a
 * loss — type a lower count and the shortfall becomes "damage". It is the easiest
 * place in the app to hide theft, so the gate is on the server, not the browser.
 */
async function requireAdjust(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return "You are not signed in.";
  if (!hasPermission(session, "stock.adjust")) {
    return "You do not have permission to adjust stock.";
  }
  return null;
}

const lineSchema = z.object({
  variantId: z.number().int().positive(),
  // What was actually on the shelf. Never a signed delta — the sign is derived,
  // so it cannot be typed backwards (§19.7).
  countedQty: z.number().min(0, "A counted quantity cannot be negative"),
});

const adjustmentSchema = z.object({
  date: z.string().min(1, "Date is required"),
  adjustmentTypeId: z.number().int().positive("Choose a reason"),
  remark: z.string().trim().max(500).optional(),
  items: z.array(lineSchema).min(1, "Count at least one product"),
});

export type AdjustmentInput = z.input<typeof adjustmentSchema>;

async function nextAdjustmentNo(tx: Tx): Promise<string> {
  const last = await tx.stockAdjustment.findFirst({
    orderBy: { id: "desc" },
    select: { adjustmentNo: true },
  });
  const n = last ? parseInt(last.adjustmentNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `ADJ-${String(n + 1).padStart(5, "0")}`;
}

export async function saveAdjustment(input: AdjustmentInput): Promise<ActionResult> {
  const denied = await requireAdjust();
  if (denied) return { error: denied };

  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const a = parsed.data;

  // Same variant counted twice would fight itself — the last count wins.
  const merged = new Map<number, number>();
  for (const it of a.items) merged.set(it.variantId, it.countedQty);

  // You cannot count 4.5 shirts on a shelf (§21) — and an adjustment is the one
  // screen where a fraction would be *believed*, because a count is not derived
  // from anything: whatever is typed becomes the truth.
  const badQty = await checkVariantQtys(
    prisma,
    [...merged].map(([variantId, qty]) => ({ variantId, qty })),
  );
  if (badQty) return { error: badQty };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const type = await tx.adjustmentType.findUnique({
        where: { id: a.adjustmentTypeId },
        select: { name: true },
      });
      if (!type) throw new Error("That reason no longer exists.");

      const branch = await tx.branch.findFirst({ select: { id: true } });
      const session = await auth();
      const userId = session?.user?.id ? Number(session.user.id) : null;

      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustmentNo: await nextAdjustmentNo(tx),
          date: new Date(a.date),
          remark: a.remark?.trim() || null,
          adjustmentTypeId: a.adjustmentTypeId,
          branchId: branch?.id ?? null,
          createdById: userId,
        },
      });

      let lossValue = 0;
      let changed = 0;

      for (const [variantId, countedQty] of merged) {
        const v = await tx.productVariant.findUnique({
          where: { id: variantId },
          select: { stockQty: true, purchasePrice: true },
        });
        if (!v) throw new Error("Product not found.");

        const onHand = Number(v.stockQty);
        const cost = Number(v.purchasePrice);
        const delta = round3(countedQty - onHand);

        // A line that changes nothing is not a correction — don't record it.
        if (delta === 0) continue;
        changed++;

        await tx.stockAdjustmentItem.create({
          data: {
            adjustmentId: adjustment.id,
            variantId,
            stockQty: round3(onHand),
            countedQty: round3(countedQty),
            delta,
            cost: round2(cost),
          },
        });

        // The count IS the new stock — that is the whole point of counting.
        // The weighted-average cost does NOT move: a lost shirt does not make the
        // remaining shirts cheaper or dearer, there are simply fewer of them (§19.5).
        await tx.productVariant.update({
          where: { id: variantId },
          data: { stockQty: round3(countedQty) },
        });

        await tx.stockMovement.create({
          data: {
            variantId,
            type: "ADJUSTMENT",
            qty: delta, // signed: negative = goods gone
            refType: "adjustment",
            refId: adjustment.id,
          },
        });

        // Loss is positive, goods found are negative — the P&L nets them.
        lossValue = round2(lossValue + -delta * cost);
      }

      if (changed === 0) {
        throw new Error("Nothing to adjust — every count matches what is on the books.");
      }

      await tx.stockAdjustment.update({
        where: { id: adjustment.id },
        data: { lossValue },
      });

      // The loss lands in the P&L, or nobody ever sees it (§19.6).
      await postStockLossExpense(tx, {
        adjustmentId: adjustment.id,
        adjustmentNo: adjustment.adjustmentNo,
        typeName: type.name,
        value: lossValue,
        branchId: branch?.id ?? null,
      });

      return adjustment.id;
    });

    revalidatePath("/adjustments");
    revalidatePath("/inventory");
    revalidatePath("/expenses");
    revalidatePath("/reports");
    return { ok: true, id: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Our own guards carry a message worth showing; anything else does not.
    if (msg && !msg.includes("Invalid") && msg.length < 120) return { error: msg };
    return { error: "Something went wrong saving the adjustment." };
  }
}

export async function deleteAdjustment(id: number): Promise<ActionResult> {
  const denied = await requireAdjust();
  if (denied) return { error: denied };

  const adjustment = await prisma.stockAdjustment.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!adjustment) return { error: "That adjustment no longer exists." };

  // Undoing a write-off puts goods back; undoing a "found" takes them away again.
  // If that would drive stock negative, the goods have since been sold — refuse,
  // rather than invent stock that is not there. Same discipline as a purchase.
  for (const item of adjustment.items) {
    const v = await prisma.productVariant.findUnique({
      where: { id: item.variantId },
      select: { stockQty: true, sku: true },
    });
    if (!v) continue;
    if (Number(v.stockQty) - Number(item.delta) < -0.0005) {
      return {
        error: `Undoing this would leave "${v.sku}" with negative stock — it has been sold since. Adjust it again instead.`,
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of adjustment.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { decrement: Number(item.delta) } },
        });
      }
      await tx.stockMovement.deleteMany({
        where: { refType: "adjustment", refId: id },
      });
      // The expense it booked cascades away with it (Expense.stockAdjustmentId).
      await tx.stockAdjustment.delete({ where: { id } });
    });
  } catch {
    return { error: "Failed to delete the adjustment." };
  }

  revalidatePath("/adjustments");
  revalidatePath("/inventory");
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

// ------------------------------------------------------- adjustment types

const typeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
});

export async function saveAdjustmentType(
  input: z.input<typeof typeSchema>,
): Promise<ActionResult> {
  const denied = await requireAdjust();
  if (denied) return { error: denied };

  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await prisma.adjustmentType.create({ data: { name: parsed.data.name } });
  } catch {
    return { error: "A reason with that name already exists." };
  }

  revalidatePath("/adjustments");
  return { ok: true };
}

export async function deleteAdjustmentType(id: number): Promise<ActionResult> {
  const denied = await requireAdjust();
  if (denied) return { error: denied };

  const type = await prisma.adjustmentType.findUnique({
    where: { id },
    select: { _count: { select: { adjustments: true } } },
  });
  if (!type) return { error: "That reason no longer exists." };
  if (type._count.adjustments > 0) {
    return {
      error: `${type._count.adjustments} adjustment(s) use this reason, so it cannot be deleted.`,
    };
  }

  try {
    await prisma.adjustmentType.delete({ where: { id } });
  } catch {
    return { error: "Failed to delete the reason." };
  }

  revalidatePath("/adjustments");
  return { ok: true };
}

// ---------------------------------------------------------- product search

export type VariantHit = {
  variantId: number;
  label: string;
  sku: string;
  stockQty: number;
  cost: number;
  /** Whether a fraction of this can sit on a shelf — a shirt's cannot (§21). */
  allowDecimal: boolean;
};

/** Find variants to count. Same search the POS uses: name, SKU or barcode. */
export async function searchVariants(term: string): Promise<VariantHit[]> {
  const denied = await requireAdjust();
  if (denied) return [];

  const q = term.trim();
  if (q.length < 1) return [];

  const variants = await prisma.productVariant.findMany({
    where: {
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q } },
        { product: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: {
      product: { select: { name: true, unit: { select: { allowDecimal: true } } } },
    },
    orderBy: [{ productId: "asc" }, { sortIndex: "asc" }],
    take: 20,
  });

  return variants.map((v) => ({
    variantId: v.id,
    label: `${v.product.name}${v.label ? ` — ${v.label}` : ""}`,
    sku: v.sku,
    stockQty: Number(v.stockQty),
    cost: Number(v.purchasePrice),
    allowDecimal: v.product.unit?.allowDecimal ?? false,
  }));
}
