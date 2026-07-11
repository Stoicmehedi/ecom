"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { avgAfterReversal, round2, round3 } from "@/lib/costing";
import type { Prisma } from "@/generated/prisma/client";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const schema = z.object({
  purchaseId: z.number().int().positive(),
  returnTypeId: z.number().int({ message: "Pick a return reason" }).positive("Pick a return reason"),
  date: z.string().min(1, "Return date is required"),
  note: z.string().trim().max(500).optional(),
  refunded: z.number().min(0).default(0),
  refundMethod: z.string().trim().optional(),
  refundAccountId: z.number().int().nullable().optional(),
  items: z
    .array(
      z.object({
        purchaseItemId: z.number().int().positive(),
        qty: z.number().min(0),
      }),
    )
    .min(1),
});

export type ReturnInput = z.input<typeof schema>;

type Tx = Prisma.TransactionClient;

async function nextReturnNo(tx: Tx): Promise<string> {
  const last = await tx.purchaseReturn.findFirst({
    orderBy: { id: "desc" },
    select: { returnNo: true },
  });
  const n = last ? parseInt(last.returnNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `PRT-${String(n + 1).padStart(5, "0")}`;
}

export async function savePurchaseReturn(input: ReturnInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = parsed.data;

  const lines = r.items.filter((i) => i.qty > 0);
  if (lines.length === 0) return { error: "Enter a return quantity for at least one item." };

  const purchase = await prisma.purchase.findUnique({
    where: { id: r.purchaseId },
    include: { items: { include: { variant: true } } },
  });
  if (!purchase) return { error: "Purchase not found." };

  const byId = new Map(purchase.items.map((i) => [i.id, i]));

  // Validate every line before touching anything.
  for (const line of lines) {
    const item = byId.get(line.purchaseItemId);
    if (!item) return { error: "That product is not on this purchase." };

    const available = round3(Number(item.qty) - Number(item.returnedQty));
    if (line.qty > available + 0.0005) {
      return {
        error: `You can return at most ${available} of "${item.variant.sku}" — the rest is already returned.`,
      };
    }

    const inStock = Number(item.variant.stockQty);
    if (line.qty > inStock + 0.0005) {
      return {
        error: `Only ${inStock} of "${item.variant.sku}" is in stock — you cannot return more than you hold.`,
      };
    }
  }

  const total = round2(
    lines.reduce((s, l) => {
      const item = byId.get(l.purchaseItemId)!;
      return s + l.qty * Number(item.purchasePrice);
    }, 0),
  );

  if (r.refunded > total + 0.005) {
    return { error: "Refund is more than the value of the returned goods." };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ret = await tx.purchaseReturn.create({
        data: {
          returnNo: await nextReturnNo(tx),
          purchaseId: r.purchaseId,
          supplierId: purchase.supplierId,
          returnTypeId: r.returnTypeId,
          date: new Date(r.date),
          note: r.note?.trim() || null,
          total,
          refunded: round2(r.refunded),
        },
      });

      for (const line of lines) {
        const item = byId.get(line.purchaseItemId)!;
        const price = Number(item.purchasePrice);

        await tx.purchaseReturnItem.create({
          data: {
            returnId: ret.id,
            purchaseItemId: item.id,
            variantId: item.variantId,
            qty: round3(line.qty),
            price: round2(price),
            subtotal: round2(line.qty * price),
          },
        });

        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { returnedQty: { increment: round3(line.qty) } },
        });

        // Goods go back to the supplier: stock down, cost un-wound.
        const v = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
          select: { stockQty: true, purchasePrice: true },
        });
        const stock = Number(v.stockQty);
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQty: round3(stock - line.qty),
            purchasePrice: avgAfterReversal(
              stock,
              Number(v.purchasePrice),
              line.qty,
              price,
            ),
          },
        });

        await tx.stockMovement.create({
          data: {
            variantId: item.variantId,
            type: "PURCHASE_RETURN",
            qty: round3(-line.qty),
            refType: "purchase_return",
            refId: ret.id,
            note: `Return against ${purchase.purchaseNo}`,
          },
        });
      }

      if (purchase.supplierId) {
        // The goods going back cancels that much of what we owe. If the supplier
        // hands cash back instead, the payable stands and the cash comes in.
        const netDueChange = round2(r.refunded - total);
        await tx.contact.update({
          where: { id: purchase.supplierId },
          data: { dueBalance: { increment: netDueChange } },
        });
      }

      if (r.refunded > 0) {
        await tx.payment.create({
          data: {
            direction: "IN",
            amount: round2(r.refunded),
            method: r.refundMethod || "CASH",
            accountId: r.refundAccountId ?? null,
            contactId: purchase.supplierId,
            purchaseReturnId: ret.id,
            date: new Date(r.date),
            note: `Refund for ${ret.returnNo}`,
          },
        });
        if (r.refundAccountId) {
          await tx.account.update({
            where: { id: r.refundAccountId },
            data: { balance: { increment: round2(r.refunded) } },
          });
        }
      }

      return ret.id;
    });

    revalidatePath("/purchases");
    revalidatePath("/purchase-returns");
    revalidatePath("/inventory");
    revalidatePath("/suppliers");
    return { ok: true, id };
  } catch {
    return { error: "Something went wrong saving the return." };
  }
}

export async function deletePurchaseReturn(id: number): Promise<ActionResult> {
  const ret = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: { items: true, payments: true },
  });
  if (!ret) return { error: "Return not found." };

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of ret.items) {
        const v = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
          select: { stockQty: true, purchasePrice: true },
        });
        const stock = Number(v.stockQty);
        const q = Number(item.qty);
        const price = Number(item.price);

        // Putting the goods back on the shelf is a receipt again.
        const base = Math.max(stock, 0);
        const denom = base + q;
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQty: round3(stock + q),
            purchasePrice:
              denom > 0
                ? round2((base * Number(v.purchasePrice) + q * price) / denom)
                : round2(price),
          },
        });

        await tx.purchaseItem.update({
          where: { id: item.purchaseItemId },
          data: { returnedQty: { decrement: round3(q) } },
        });
      }

      await tx.stockMovement.deleteMany({
        where: { refType: "purchase_return", refId: id },
      });

      for (const p of ret.payments) {
        if (p.accountId) {
          await tx.account.update({
            where: { id: p.accountId },
            data: { balance: { decrement: Number(p.amount) } },
          });
        }
      }
      await tx.payment.deleteMany({ where: { purchaseReturnId: id } });

      if (ret.supplierId) {
        const netDueChange = round2(Number(ret.refunded) - Number(ret.total));
        await tx.contact.update({
          where: { id: ret.supplierId },
          data: { dueBalance: { decrement: netDueChange } },
        });
      }

      await tx.purchaseReturn.delete({ where: { id } });
    });
  } catch {
    return { error: "Failed to delete the return." };
  }

  revalidatePath("/purchases");
  revalidatePath("/purchase-returns");
  revalidatePath("/inventory");
  revalidatePath("/suppliers");
  return { ok: true };
}
