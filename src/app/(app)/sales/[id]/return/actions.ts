"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { avgAfterPurchase, avgAfterReversal, round2, round3 } from "@/lib/costing";
import type { Prisma } from "@/generated/prisma/client";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const schema = z.object({
  saleId: z.number().int().positive(),
  date: z.string().min(1, "Return date is required"),
  note: z.string().trim().max(500).optional(),
  refunded: z.number().min(0).default(0),
  refundMethod: z.string().trim().optional(),
  refundAccountId: z.number().int().nullable().optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.number().int().positive(),
        qty: z.number().min(0),
      }),
    )
    .min(1),
});

export type SaleReturnInput = z.input<typeof schema>;

type Tx = Prisma.TransactionClient;

async function nextReturnNo(tx: Tx): Promise<string> {
  const last = await tx.saleReturn.findFirst({
    orderBy: { id: "desc" },
    select: { returnNo: true },
  });
  const n = last ? parseInt(last.returnNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `SRT-${String(n + 1).padStart(5, "0")}`;
}

export async function saveSaleReturn(input: SaleReturnInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = parsed.data;

  const lines = r.items.filter((i) => i.qty > 0);
  if (lines.length === 0) {
    return { error: "Enter a return quantity for at least one item." };
  }

  const sale = await prisma.sale.findUnique({
    where: { id: r.saleId },
    include: {
      items: { include: { variant: true } },
      customer: { select: { id: true, isWalkIn: true } },
    },
  });
  if (!sale) return { error: "Sale not found." };

  const byId = new Map(sale.items.map((i) => [i.id, i]));

  for (const line of lines) {
    const item = byId.get(line.saleItemId);
    if (!item) return { error: "That product is not on this sale." };

    const available = round3(Number(item.qty) - Number(item.returnedQty));
    if (line.qty > available + 0.0005) {
      return {
        error: `You can return at most ${available} of "${item.variant.sku}" — the rest is already returned.`,
      };
    }
  }

  const total = round2(
    lines.reduce((s, l) => {
      const item = byId.get(l.saleItemId)!;
      return s + l.qty * Number(item.price);
    }, 0),
  );

  if (r.refunded > total + 0.005) {
    return { error: "Refund is more than the value of the returned goods." };
  }

  // Crediting a walk-in would leave a balance owed to nobody — the money has to
  // go back across the counter.
  const isWalkIn = !sale.customerId || (sale.customer?.isWalkIn ?? false);
  if (isWalkIn && r.refunded < total - 0.005) {
    return {
      error: "A walk-in must be refunded in full — there is no account to credit.",
    };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ret = await tx.saleReturn.create({
        data: {
          returnNo: await nextReturnNo(tx),
          saleId: sale.id,
          customerId: sale.customerId,
          date: new Date(r.date),
          note: r.note?.trim() || null,
          total,
          refunded: round2(r.refunded),
        },
      });

      for (const line of lines) {
        const item = byId.get(line.saleItemId)!;
        const price = Number(item.price);
        const cost = Number(item.costAtSale);

        await tx.saleReturnItem.create({
          data: {
            returnId: ret.id,
            saleItemId: item.id,
            variantId: item.variantId,
            qty: round3(line.qty),
            price: round2(price),
            cost: round2(cost),
            subtotal: round2(line.qty * price),
          },
        });

        await tx.saleItem.update({
          where: { id: item.id },
          data: { returnedQty: { increment: round3(line.qty) } },
        });

        // Back on the shelf at the cost it left at — not today's average, which
        // would silently rewrite what this stock is worth.
        const v = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
          select: { stockQty: true, purchasePrice: true },
        });
        const stock = Number(v.stockQty);
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQty: round3(stock + line.qty),
            purchasePrice: avgAfterPurchase(
              stock,
              Number(v.purchasePrice),
              line.qty,
              cost,
            ),
          },
        });

        await tx.stockMovement.create({
          data: {
            variantId: item.variantId,
            type: "SALE_RETURN",
            qty: round3(line.qty),
            refType: "sale_return",
            refId: ret.id,
            note: `Return against ${sale.invoiceNo}`,
          },
        });
      }

      // Goods coming back cancel that much of the debt; cash handed over
      // reinstates it and leaves the drawer.
      if (sale.customerId) {
        const netDueChange = round2(r.refunded - total);
        await tx.contact.update({
          where: { id: sale.customerId },
          data: { dueBalance: { increment: netDueChange } },
        });
      }

      if (r.refunded > 0) {
        await tx.payment.create({
          data: {
            direction: "OUT",
            amount: round2(r.refunded),
            method: r.refundMethod || "CASH",
            accountId: r.refundAccountId ?? null,
            contactId: sale.customerId,
            saleReturnId: ret.id,
            date: new Date(r.date),
            note: `Refund for ${ret.returnNo}`,
          },
        });
        if (r.refundAccountId) {
          await tx.account.update({
            where: { id: r.refundAccountId },
            data: { balance: { decrement: round2(r.refunded) } },
          });
        }
      }

      return ret.id;
    });

    revalidatePath("/sales");
    revalidatePath("/sale-returns");
    revalidatePath("/inventory");
    revalidatePath("/customers");
    return { ok: true, id };
  } catch {
    return { error: "Something went wrong saving the return." };
  }
}

export async function deleteSaleReturn(id: number): Promise<ActionResult> {
  const ret = await prisma.saleReturn.findUnique({
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

        if (q > stock + 0.0005) {
          throw new Error("stock-gone");
        }

        // The goods leave again, at the cost they came back in at.
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQty: round3(stock - q),
            purchasePrice: avgAfterReversal(
              stock,
              Number(v.purchasePrice),
              q,
              Number(item.cost),
            ),
          },
        });

        await tx.saleItem.update({
          where: { id: item.saleItemId },
          data: { returnedQty: { decrement: round3(q) } },
        });
      }

      await tx.stockMovement.deleteMany({
        where: { refType: "sale_return", refId: id },
      });

      for (const p of ret.payments) {
        if (p.accountId) {
          await tx.account.update({
            where: { id: p.accountId },
            data: { balance: { increment: Number(p.amount) } },
          });
        }
      }
      await tx.payment.deleteMany({ where: { saleReturnId: id } });

      if (ret.customerId) {
        const netDueChange = round2(Number(ret.refunded) - Number(ret.total));
        await tx.contact.update({
          where: { id: ret.customerId },
          data: { dueBalance: { decrement: netDueChange } },
        });
      }

      await tx.saleReturn.delete({ where: { id } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "stock-gone") {
      return {
        error: "Cannot delete: the returned stock has already been sold again.",
      };
    }
    return { error: "Failed to delete the return." };
  }

  revalidatePath("/sales");
  revalidatePath("/sale-returns");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  return { ok: true };
}
